module.exports = function(RED) {
    const { exec } = require('child_process');
    const axios = require('axios');
    const arp = require('node-arp');
    const os = require('os');

    // Tworzymy globalny obiekt do przechowywania listy paneli
    const globalContext = {
        availablePanels: []
    };

    // Tworzymy endpoint HTTP do pobierania listy paneli
    RED.httpAdmin.get('/adiosunpanels', RED.auth.needsPermission('adiosun.read'), function(req, res) {
        console.log('Żądanie listy paneli z UI. Dostępne panele:', globalContext.availablePanels.length);
        res.json(globalContext.availablePanels);
    });

    // Function to get Node-RED's network range
    function getNodeRedNetwork() {
        const interfaces = os.networkInterfaces();
        console.log('Available network interfaces:', JSON.stringify(interfaces, null, 2));
        
        // Get the IP address that Node-RED is using
        const nodeRedIp = RED.settings.uiHost || '127.0.0.1';
        console.log('Node-RED IP:', nodeRedIp);

        // Find the network interface that matches Node-RED's IP
        for (const name of Object.keys(interfaces)) {
            for (const interface of interfaces[name]) {
                if (interface.family === 'IPv4' && !interface.internal) {
                    console.log(`Checking interface ${name}:`, interface);
                    if (interface.address === nodeRedIp || nodeRedIp === '0.0.0.0') {
                        const ipParts = interface.address.split('.');
                        return {
                            name: name,
                            range: ipParts.slice(0, 3).join('.'),
                            address: interface.address,
                            netmask: interface.netmask
                        };
                    }
                }
            }
        }

        // If we couldn't find the exact interface, use the first non-internal IPv4 interface
        for (const name of Object.keys(interfaces)) {
            for (const interface of interfaces[name]) {
                if (interface.family === 'IPv4' && !interface.internal) {
                    const ipParts = interface.address.split('.');
                    return {
                        name: name,
                        range: ipParts.slice(0, 3).join('.'),
                        address: interface.address,
                        netmask: interface.netmask
                    };
                }
            }
        }

        // Fallback to local network
        return {
            name: 'default',
            range: '192.168.1',
            address: '192.168.1.1',
            netmask: '255.255.255.0'
        };
    }

    // Function to get device details
    async function getDeviceDetails(ip) {
        const endpoints = [
            '/httpapi.asp?command=getStatusEx',
            '/httpapi.asp?command=getStatus'
        ];

        for (const endpoint of endpoints) {
            try {
                console.log(`Trying endpoint ${endpoint} for IP ${ip}`);
                const url = `http://${ip}${endpoint}`;
                const response = await axios.get(url, {
                    timeout: 1000,
                    headers: {
                        'User-Agent': 'AdiosunScanner/1.0'
                    }
                });

                if (response.data) {
                    console.log(`Got response from ${ip}:`, response.data);
                    let deviceInfo;

                    if (typeof response.data === 'string') {
                        try {
                            deviceInfo = JSON.parse(response.data);
                        } catch (e) {
                            // Try parsing as URL params
                            const params = new URLSearchParams(response.data);
                            deviceInfo = Object.fromEntries(params.entries());
                        }
                    } else {
                        deviceInfo = response.data;
                    }

                    // Check if it's an Adiosun device - rozszerzona logika wykrywania
                    if (deviceInfo && (
                        deviceInfo.type === 'adiosun' ||
                        (deviceInfo.name && deviceInfo.name.toLowerCase().includes('adiosun')) ||
                        (deviceInfo.model && deviceInfo.model.toLowerCase().includes('adiosun')) ||
                        (deviceInfo.DeviceName && deviceInfo.DeviceName.toLowerCase().includes('adiosun')) ||
                        (deviceInfo.DeviceType && deviceInfo.DeviceType.toLowerCase().includes('adiosun')) ||
                        (deviceInfo.DeviceModel && deviceInfo.DeviceModel.toLowerCase().includes('adiosun')) ||
                        (deviceInfo.DeviceName && deviceInfo.DeviceName.length > 0) || // Akceptuj każde urządzenie z nazwą
                        (deviceInfo.DeviceType && deviceInfo.DeviceType.length > 0)    // Akceptuj każde urządzenie z typem
                    )) {
                        console.log(`Confirmed device at ${ip}:`, deviceInfo);
                        return deviceInfo;
                    }
                }
        } catch (error) {
                console.log(`Endpoint ${endpoint} failed for ${ip}:`, error.message);
        }
        }
        return null;
    }

    // Function to get local network range
    function getLocalNetworkRange() {
        const interfaces = os.networkInterfaces();
        console.log('Available network interfaces:', JSON.stringify(interfaces, null, 2));
        
        // Find the first active non-internal IPv4 interface
        for (const name of Object.keys(interfaces)) {
            for (const interface of interfaces[name]) {
                if (interface.family === 'IPv4' && !interface.internal) {
                    console.log(`Found active interface ${name}:`, interface);
                    const ipParts = interface.address.split('.');
                    return {
                        name: name,
                        range: ipParts.slice(0, 3).join('.'),
                        address: interface.address,
                        netmask: interface.netmask
                    };
                }
            }
        }

        // Fallback to local network
        return {
            name: 'default',
            range: '192.168.1',
            address: '192.168.1.1',
            netmask: '255.255.255.0'
        };
    }

    // Function to get MAC address from IP using system arp command
    function getMacFromIp(ip) {
        return new Promise((resolve) => {
            // First try arp -a
            exec(`arp -a ${ip}`, async (error, stdout, stderr) => {
                if (error || stderr) {
                    console.log('ARP -a Error:', error || stderr);
                    // Fallback to direct device query
                    try {
                        const response = await axios.get(`http://${ip}/httpapi.asp?command=getInfo`, {
                            timeout: 1000
                        });
                        if (response.data && response.data.mac) {
                            resolve(response.data.mac.toLowerCase());
                            return;
                        }
                    } catch (e) {
                        console.log('Direct MAC query failed:', e.message);
                    }
                    resolve(null);
                    return;
                }
                
                console.log('ARP Output for ${ip}:', stdout);
                const lines = stdout.split('\n');
                for (const line of lines) {
                    if (line.includes(ip)) {
                        const match = line.match(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/i);
                        if (match) {
                            resolve(match[0].toLowerCase().replace(/-/g, ':'));
                            return;
                        }
                    }
                }
                resolve(null);
            });
        });
    }

    // Function to decode hex string to text
    function hexToText(hex) {
        try {
            let str = '';
            for (let i = 0; i < hex.length; i += 2) {
                str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
            }
            return str;
        } catch (e) {
            return hex;
        }
    }

    // Function to get device status
    async function getDeviceStatus(ip) {
        try {
            console.log(`Getting device status from: http://${ip}/httpapi.asp?command=getStatusEx`);
            const response = await axios.get(`http://${ip}/httpapi.asp?command=getStatusEx`, {
                timeout: 2000
            });
            
            if (response.data) {
                console.log('Device status response:', response.data);
                // Try to parse the response if it's a string
                let status = response.data;
                if (typeof response.data === 'string') {
                    try {
                        status = JSON.parse(response.data);
                    } catch (e) {
                        console.log('Failed to parse status response:', e);
                        // Split the response by & to handle non-JSON format
                        const pairs = response.data.split('&');
                        status = {};
                        pairs.forEach(pair => {
                            const [key, value] = pair.split('=');
                            status[key] = decodeURIComponent(value || '');
                        });
                    }
                }
                return status;
            }
            return null;
        } catch (error) {
            console.log('Error getting device status:', error);
            return null;
        }
    }

    // Function to get player status
    async function getPlayerStatus(ip) {
        try {
            console.log(`Getting player status from: http://${ip}/httpapi.asp?command=getPlayerStatus`);
            const response = await axios.get(`http://${ip}/httpapi.asp?command=getPlayerStatus`, {
                timeout: 2000
            });
            
            if (response.data) {
                let status = response.data;
                if (typeof response.data === 'string') {
                    try {
                        status = JSON.parse(response.data);
                    } catch (e) {
                        const pairs = response.data.split('&');
                        status = {};
                        pairs.forEach(pair => {
                            const [key, value] = pair.split('=');
                            status[key] = decodeURIComponent(value || '');
                        });
                    }
                }
                return status;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    // Function to send command to device
    async function sendDeviceCommand(ip, command) {
        try {
            const url = `http://${ip}/httpapi.asp?command=${command}`;
            console.log(`Sending command: ${url}`);
            const response = await axios.get(url, {
                timeout: 2000
            });
            console.log(`Command response:`, response.data);
            return response.data;
        } catch (error) {
            console.error(`Command error:`, error.message);
            return null;
        }
    }

    // Function to scan network for Adiosun devices
    async function scanNetwork() {
        return new Promise((resolve, reject) => {
                const devices = [];
            const networkRange = getLocalNetworkRange();
            const baseIp = networkRange.range;
            
            // Create array of IPs to scan
            const ipPromises = [];
            for (let i = 1; i <= 254; i++) {
                const ip = `${baseIp}.${i}`;
                ipPromises.push(
                    new Promise(async (resolveIp) => {
                        try {
                            // Try to get device details
                                    const details = await getDeviceDetails(ip);
                                    if (details) {
                                // Get MAC address
                                const mac = await getMacFromIp(ip);
                                if (mac) {
                                        devices.push({
                                            ip: ip,
                                            mac: mac.toUpperCase(),
                                            name: details.DeviceName || 'Unknown',
                                            uuid: details.uuid || '',
                                            firmware: details.firmware || ''
                                        });
                                    }
                                }
                        } catch (error) {
                            // Ignore errors for individual IPs
                        }
                        resolveIp();
                    })
                );
            }

            // Wait for all IPs to be checked
            Promise.all(ipPromises)
                .then(() => {
                    resolve(devices);
                })
                .catch(error => {
                    reject(error);
            });
        });
    }

    // Register the HTTP endpoint for device scanning
    RED.httpAdmin.get('/adiosundevices', RED.auth.needsPermission('adiosun.read'), function(req, res) {
        scanNetwork().then(devices => {
            res.json(devices);
        }).catch(error => {
            res.sendStatus(500);
            RED.log.error('Error scanning for Adiosun devices: ' + error.toString());
        });
    });

    // Function to download and extract notifications
    async function downloadNotifications(ip) {
        try {
            console.log('Downloading notifications...');
            const response = await axios.get(`http://${ip}/httpapi.asp?command=downloadNotifications`, {
                timeout: 5000,
                responseType: 'arraybuffer'
            });

            // Save zip file
            const zipPath = '/rw/user/www/prompt/notifications.zip';
            await sendDeviceCommand(ip, `echo '${response.data.toString('base64')}' | base64 -d > ${zipPath}`);
            
            // Extract zip
            await sendDeviceCommand(ip, `cd /rw/user/www/prompt && unzip -o notifications.zip`);
            
            // Remove zip file
            await sendDeviceCommand(ip, `rm ${zipPath}`);
            
            console.log('Notifications downloaded and extracted successfully');
            return true;
        } catch (error) {
            console.error('Error downloading notifications:', error);
            return false;
        }
    }

    // Register the HTTP endpoint for downloading notifications
    RED.httpAdmin.get('/adiosunnotifications/:ip', RED.auth.needsPermission('adiosun.write'), function(req, res) {
        const ip = req.params.ip;
        downloadNotifications(ip).then(success => {
            if (success) {
                res.sendStatus(200);
            } else {
                res.sendStatus(500);
            }
        }).catch(error => {
            res.sendStatus(500);
        });
    });

    // Function to get player info
    async function getPlayerInfo(ip) {
        try {
            const status = await getPlayerStatus(ip);
            if (status) {
                return {
                    artist: status.Artist || status.artist || '',
                    title: status.Title || status.title || '',
                    album: status.Album || status.album || '',
                    state: status.status || 'unknown',
                    volume: parseInt(status.vol || status.volume || 0)
                };
            }
            return null;
        } catch (error) {
            console.error('Error getting player info:', error);
            return null;
        }
    }

    // Function to convert string to hex
        function stringToHex(str) {
            let hex = '';
            for(let i = 0; i < str.length; i++) {
                hex += str.charCodeAt(i).toString(16).padStart(2, '0').toUpperCase();
            }
            return hex;
        }

    // Function to center text with spaces
    function centerText(text, length) {
        // Upewniamy się że tekst nie jest dłuższy niż 12 znaków
        if (text.length > 12) {
            text = text.substring(0, 12);
        }
        if (text.length >= length) return text;
        const spaces = length - text.length;
        const leftSpaces = Math.floor(spaces / 2);
        const rightSpaces = spaces - leftSpaces;
        return ' '.repeat(leftSpaces) + text + ' '.repeat(rightSpaces);
    }

    // Function to convert decimal MAC to hexadecimal
    function convertMacToHex(macDecimal) {
        // Check if macDecimal is already in hex format (contains letters)
        if (!/^[0-9]+$/.test(macDecimal)) {
            return macDecimal; // Already in hex format or non-numeric format
        }
        
        // Convert decimal to hex and uppercase
        return parseInt(macDecimal).toString(16).toUpperCase();
    }

    // Function to update volume and send command
    function updateVolume(node, increment) {
        node.lastVolumeControl = Date.now();
        if (increment) {
            node.volume = Math.min(100, node.volume + node.volumeStep);
        } else {
            node.volume = Math.max(0, node.volume - node.volumeStep);
        }
        console.log(`Volume ${increment ? 'increased' : 'decreased'} to: ${node.volume}`);
        
        // Send HTTP command to device
        sendDeviceCommand(node.deviceIp, `setPlayerCmd:vol:${node.volume}`)
            .catch(error => node.error("Error sending volume command: " + error));
        
        // Update volume display on panel
        sendVolumeDisplay(node, node.volume, node.mute || "0", node.displayNumber);
    }

    // Function to start volume change
    function startVolumeChange(node, increment) {
        node.lastVolumeControl = Date.now();
        // Clear any existing interval
        if (node.volumeInterval) {
            clearInterval(node.volumeInterval);
        }
        // Start new interval
        node.volumeInterval = setInterval(() => updateVolume(node, increment), node.volumeUpdateInterval);
    }

    // Function to stop volume change
    function stopVolumeChange(node) {
        if (node.volumeInterval) {
            clearInterval(node.volumeInterval);
            node.volumeInterval = null;
            console.log('Volume change stopped');
        }
    }

        // Function to format and send volume display
    function sendVolumeDisplay(node, volume, mute, displayNum) {
            if (!node.client || !node.macPanel) return;

            let vol = volume.toString();
            let voldec = volume;
            let hexcom = '';
            
            if (mute === "0") {
                vol = "" + vol;
            } else {
                vol = "0";
            voldec = 0;
            }

        // Convert MAC to hex format if needed
        const macHex = convertMacToHex(node.macPanel);

            // Format for M6/M18 panels (type 0)
            if (node.panelType === "icons") {
                if (voldec <= 9) {
                    hexcom = "1E030" + (displayNum-1) + "20564F4C202020" + stringToHex(vol) + "20";
                } else if (voldec == 100) {
                    hexcom = "1E030" + (displayNum-1) + "20564F4C20" + stringToHex(vol) + "20";
                } else {
                    hexcom = "1E030" + (displayNum-1) + "20564F4C2020" + stringToHex(vol) + "20";
                }

                // Send formatted hex command via MQTT
            const topic = `ampio/to/${macHex}/raw`;
                console.log(`Sending volume display: ${hexcom} to topic: ${topic}`);
                node.client.publish(topic, hexcom);
            }
        }

    // Function to check if string is already in HEX format
    function isHexString(str) {
        // Sprawdza czy string składa się tylko z cyfr 0-9 i liter A-F
        return /^[0-9A-F]+$/i.test(str);
    }

    // Function to convert hex to text if needed
    function processText(text) {
        if (isHexString(text)) {
            return hexToText(text);
        }
        return text;
    }

    // Function to format and send track info display
    function sendTrackInfoDisplay(node, artist, title, displayNum) {
        if (!node.client || !node.macPanel) return;

        // Convert MAC to hex format if needed
        const macHex = convertMacToHex(node.macPanel);

        // Clear existing interval if any
        if (node.trackInfoInterval) {
            clearInterval(node.trackInfoInterval);
            node.trackInfoInterval = null;
        }

        // Process artist and title - convert from hex if needed
        const processedArtist = processText(artist || "");
        const processedTitle = processText(title || "");

        // Jeśli artysta to "unknown" lub puste, wyświetl tylko tytuł
        let fullText;
        if (processedArtist.toLowerCase() === "unknown" || !processedArtist) {
            fullText = processedTitle;
        } else {
            fullText = processedArtist + (processedTitle ? " - " + processedTitle : "");
        }

        const maxLength = 12; // Maximum length for display (12 chars = 24 hex)
        let currentPosition = 0;
        let displayText;
        let pauseCounter = 0; // Licznik dla pauzy

        // Update volume display first
        sendVolumeDisplay(node, node.volume, node.mute || "0", node.displayNumber);
          
        // If text is longer than display, we'll need to scroll
        if (fullText.length > maxLength) {
            // Create scrolling effect with pauses
            node.trackInfoInterval = setInterval(() => {
                // Sprawdzamy czy jesteśmy na początku lub końcu tekstu
                const isAtStart = currentPosition === 0;
                const isAtEnd = currentPosition >= fullText.length - maxLength;

                if ((isAtStart || isAtEnd) && pauseCounter < 4) { // 4 * 1000ms = 2 sekundy pauzy
                    pauseCounter++;
                } else {
                    pauseCounter = 0;
                    if (!isAtEnd) {
                        currentPosition++;
                    } else {
                        currentPosition = 0;
                    }
                }

                displayText = fullText.substring(currentPosition);
                if (displayText.length < maxLength) {
                    // Wrap around to start
                    displayText = fullText.substring(0, maxLength);
                    currentPosition = 0;
                } else {
                    // Limit to maxLength
                    displayText = displayText.substring(0, maxLength);
                }
                    
                const displayFormatted = centerText(displayText, maxLength);
                const hexcom = "1E020" + (displayNum-1) + stringToHex(displayFormatted);
                const topic = `ampio/to/${macHex}/raw`;
                    
                node.client.publish(topic, hexcom);
                
            }, 1000); // Scroll every 1 second for slower scrolling
        } else {
            // Text fits display, center it
            displayText = centerText(fullText, maxLength);
            const hexcom = "1E020" + (displayNum-1) + stringToHex(displayText);
            const topic = `ampio/to/${macHex}/raw`;
                
            node.client.publish(topic, hexcom);
        }
    }

    // Function to update and publish track info
    async function updateAndPublishTrackInfo(node) {
        if (!node.deviceIp || !node.client) return;

        try {
            const info = await getPlayerInfo(node.deviceIp);
            if (info) {
                // Update node state
                node.currentArtist = info.artist;
                node.currentTitle = info.title;

                // Update track info display
                sendTrackInfoDisplay(node, info.artist, info.title, node.displayNumber);

                // Also update volume
                if (info.volume !== undefined) {
                    node.volume = info.volume;
                    sendVolumeDisplay(node, info.volume, node.mute || "0", node.displayNumber);
                }
            }
        } catch (error) {
            console.error('Error updating track info:', error);
        }
    }

        // Function to poll device status
    async function pollDeviceStatus(node) {
            if (!node.deviceIp) return;

            try {
            console.log(`Sprawdzanie statusu urządzenia ${node.deviceIp}`);
                const playerStatus = await getPlayerStatus(node.deviceIp);

                if (playerStatus) {
                console.log(`Otrzymano status urządzenia:`, playerStatus);
                
                    // Send status via MQTT
                    const statusMsg = {
                        topic: `${node.macPanel}/status`,
                        payload: {
                        artist: processText(playerStatus.Artist || ''),
                        title: processText(playerStatus.Title || ''),
                        album: processText(playerStatus.Album || ''),
                        volume: playerStatus.vol || 0,
                        status: playerStatus.status || 'unknown',
                        mode: playerStatus.mode || 'unknown'
                        }
                    };
                    node.send(statusMsg);

                    // Check if mode is Bluetooth (40)
                    if (playerStatus.mode === "40") {
                    const bluetoothText = "BLUETOOTH";
                    sendTrackInfoDisplay(node, bluetoothText, "", node.displayNumber);
                    } else {
                        // Update track info if changed
                    const newArtist = playerStatus.Artist || '';
                    const newTitle = playerStatus.Title || '';
                    if (newArtist !== node.currentArtist || newTitle !== node.currentTitle) {
                        node.currentArtist = newArtist;
                        node.currentTitle = newTitle;
                        sendTrackInfoDisplay(node, newArtist, newTitle, node.displayNumber);
                        }
                    }

                    // Update volume
                    if (playerStatus.vol !== undefined) {
                        node.volume = parseInt(playerStatus.vol);
                    sendVolumeDisplay(node, node.volume, node.mute || "0", node.displayNumber);
                    }

                    // Update node status
                    node.status({
                        fill: "green",
                        shape: "dot",
                        text: `${node.deviceName} - Online (Vol: ${node.volume})`
                    });
                } else {
                    node.status({
                        fill: "red",
                        shape: "ring",
                        text: "Device not responding"
                    });
                }
            } catch (error) {
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: "Error getting status"
                });
                node.error("Error polling device status: " + error.toString());
            }
        }

    function AdiosunNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        
        // Get the broker config
        node.broker = RED.nodes.getNode(config.broker);
        
        if (!node.broker) {
            node.error("No broker configuration");
            return;
        }

        // Store configuration
        node.name = config.name;
        node.macPanel = config.macPanel;
        node.deviceName = config.deviceName;
        node.deviceUuid = config.deviceUuid;
        node.deviceIp = config.deviceIp;
        node.deviceFirmware = config.deviceFirmware;
        node.panelType = config.panelType;
        node.displayNumber = config.displayNumber;
        node.lineNumber = config.lineNumber;
        node.ampioAuto = config.ampioAuto;

        // Counter for button 2 actions
        node.buttonCounter = 1;

        // Volume control variables
        node.volume = 50; // Initial volume
        node.volumeInterval = null;
        node.volumeStep = 2; // Volume change per step
        node.volumeUpdateInterval = 200; // ms between volume updates
        node.lastVolumeControl = 0; // Timestamp of last volume control
        node.volumeSyncTimeout = 5000; // 5 seconds timeout for volume sync
        node.mute = "0"; // Mute state

        // Track info variables
        node.currentArtist = "";
        node.currentTitle = "";
        node.trackInfoInterval = null;

        // Define updatePanelList here to ensure it's available
        node.updatePanelList = function() {
            console.log("updatePanelList called, but only works in UI context");
            // This function is meant to be overridden in the oneditprepare function
            // It cannot directly update the UI from here
            // Store the panels so they are available when the node is edited
        };

        // Get MQTT configuration
        const mqttConfig = node.broker.getMQTTConfig();
        
        // Create MQTT client
        const mqtt = require('mqtt');
        let client = null;

        try {
            client = mqtt.connect(mqttConfig.broker, {
                username: mqttConfig.username,
                password: mqttConfig.password
            });

            // Store client reference in node
            node.client = client;
            
            // Status polling interval
            let statusInterval = null;

            console.log("Próba połączenia MQTT do:", mqttConfig.broker);

            client.on('connect', function() {
                console.log("MQTT Connected successfully!");
                // Subscribe to devices topic
                client.subscribe('ampio/fromDB/admin/config/devices');
                console.log("Subskrypcja do tematu 'ampio/fromDB/admin/config/devices'");
                
                // Subscribe to Ampio topics if auto-configuration is enabled and icon mode is selected
                if (node.ampioAuto && node.panelType === 'icons') {
                    const baseNum = 1 + (4 * (parseInt(node.displayNumber) - 1));
                    for (let i = 0; i < 4; i++) {
                        const topic = `ampio/from/${convertMacToHex(node.macPanel)}/state/bi/${baseNum + i}`;
                        client.subscribe(topic);
                        console.log(`Subskrypcja do tematu '${topic}'`);
                    }
                }
                
                // Request devices list
                client.publish('ampio/control/admin/config', 'devices');
                console.log("Wysłano żądanie listy urządzeń: 'ampio/control/admin/config' = 'devices'");
                
                // Set up periodic refresh of device list
                node.refreshInterval = setInterval(function() {
                    console.log("Automatyczne odświeżanie listy urządzeń");
                    client.publish('ampio/control/admin/config', 'devices');
                }, 60000); // co minutę

                // Start track info updates if device IP is available
                if (node.deviceIp) {
                    // Initial status check
                    pollDeviceStatus(node);
                    
                    // Set up interval for periodic status checks
                    statusInterval = setInterval(() => pollDeviceStatus(node), 5000);
                    
                    // We don't need the original track info update now, as pollDeviceStatus handles it
                    if (node.trackInfoInterval) {
                        clearInterval(node.trackInfoInterval);
                        node.trackInfoInterval = null;
                    }
                }
            });

            client.on('error', function(error) {
                console.error("MQTT Error:", error);
                node.error("MQTT Error: " + error.toString());
            });

            client.on('message', function(topic, message) {
                console.log("Otrzymano wiadomość MQTT na temat:", topic);
                console.log("Zawartość wiadomości:", message.toString().substring(0, 200) + "...");
                
                if (topic === 'ampio/fromDB/admin/config/devices') {
                    try {
                        const data = JSON.parse(message.toString());
                        console.log("Pomyślnie sparsowano dane JSON");
                        if (data.List) {
                            console.log("Znaleziono listę urządzeń:", data.List.length);
                            // Filter only panels (type 68)
                            const panels = data.List.filter(device => device.typ_urzadzenia === 68);
                            console.log("Znaleziono paneli:", panels.length);
                            console.log("Przykładowy panel:", panels.length > 0 ? JSON.stringify(panels[0]) : "brak paneli");
                            
                            // Zapisz panele w globalnym kontekście dla dostępności z UI
                            globalContext.availablePanels = panels;
                            console.log("Zapisano panele w globalnym kontekście:", panels.length);
                            
                            // Store panels in node for later use
                            node.availablePanels = panels;
                            // Update panel list in UI if it exists
                            if (node.updatePanelList) {
                                console.log("Aktualizacja listy paneli w UI");
                                node.updatePanelList();
                            } else {
                                console.log("Funkcja updatePanelList nie jest dostępna");
                            }
                        } else {
                            console.log("Brak listy urządzeń w danych:", Object.keys(data));
                        }
                    } catch (error) {
                        console.error('Error parsing devices list:', error);
                    }
                } else if (topic.startsWith(`ampio/from/${convertMacToHex(node.macPanel)}/state/bi/`)) {
                    // Extract button number from topic
                    const buttonNum = parseInt(topic.split('/').pop());
                    const displayNum = parseInt(node.displayNumber);
                    const baseNum = 1 + (4 * (displayNum - 1));
                    const messageValue = message.toString();
                    
                    console.log(`Otrzymano wiadomość: ${messageValue} dla przycisku: ${buttonNum}, Display: ${displayNum}, Base: ${baseNum}`);
                    
                    // Only process if button is in our display range
                    if (buttonNum >= baseNum && buttonNum < baseNum + 4) {
                        const buttonIndex = buttonNum - baseNum;
                        
                        // Handle different button actions
                        switch(buttonIndex) {
                            case 0: // First button
                                if (messageValue === "1") {
                                    console.log('Pierwszy przycisk - wysyłanie komendy onepause');
                                    sendDeviceCommand(node.deviceIp, 'setPlayerCmd:onepause')
                                        .catch(error => node.error("Error sending onepause command: " + error));
                                }
                                break;
                            
                            case 1: // Second button
                                if (messageValue === "1") {
                                    // Increment counter and wrap around at 6
                                    node.buttonCounter = (node.buttonCounter % 6) + 1;
                                    console.log(`Drugi przycisk - licznik zwiększony do: ${node.buttonCounter}`);
                                    // Send command with new counter value
                                    sendDeviceCommand(node.deviceIp, `MCUKeyShortClick:${node.buttonCounter}`)
                                        .catch(error => node.error("Error sending MCUKeyShortClick command: " + error));
                                }
                                break;
                            
                            case 2: // Third button - Volume Down
                                if (messageValue === "1") {
                                    console.log('Zmniejszanie głośności - start');
                                    startVolumeChange(node, false);
                                } else if (messageValue === "0") {
                                    stopVolumeChange(node);
                                }
                                break;
                            
                            case 3: // Fourth button - Volume Up
                                if (messageValue === "1") {
                                    console.log('Zwiększanie głośności - start');
                                    startVolumeChange(node, true);
                                } else if (messageValue === "0") {
                                    stopVolumeChange(node);
                                }
                                break;
                        }

                        // Send button state with updated values
                        const output = {
                            topic: `button/${buttonIndex + 1}`,
                            payload: {
                                state: messageValue,
                                counter: node.buttonCounter,
                                volume: node.volume
                            }
                        };
                        console.log('Wysyłanie danych wyjściowych:', output);
                        node.send(output);
                    }
                }
            });

            // Clean up on close
            node.on('close', function() {
                if (node.refreshInterval) {
                    clearInterval(node.refreshInterval);
                }
                if (node.trackInfoInterval) {
                    clearInterval(node.trackInfoInterval);
                }
                if (node.volumeInterval) {
                    clearInterval(node.volumeInterval);
                }
                if (statusInterval) {
                    clearInterval(statusInterval);
                }
                if (client) {
                    client.end();
                }
            });

        } catch (error) {
            node.error("MQTT Connection Error: " + error.toString());
        }
    }
    
    RED.nodes.registerType("adiosun", AdiosunNode, {
        category: 'media',
        color: '#a6bbcf',
        defaults: {
            name: {value:""},
            broker: {type:"adiosun-config", required:true},
            macPanel: {value:"", validate: function(v) { return v.length <= 7; }},
            deviceName: {value:""},
            deviceUuid: {value:""},
            deviceIp: {value:""},
            deviceFirmware: {value:""},
            panelType: {value:"icons", required:true},
            manualIp: { value: "" },
            displayNumber: {value:"1", required:true, validate: function(v) { 
                if (this.panelType === 'icons') {
                    return v >= 1 && v <= 12;
                }
                return true;
            }},
            lineNumber: {value:"1", required:true},
            ampioAuto: {value: false}
        },
        inputs: 1,
        outputs: 1,
        icon: "file.svg",
        label: function() {
            return this.name || this.deviceName || "Adiosun";
        },
        oneditprepare: function() {
            var node = this;
            var deviceList = $("#node-input-device-list");
            var scanButton = $("#node-input-scan-devices");
            var macInput = $("#node-input-macPanel");
            var nameInput = $("#node-input-deviceName");
            var uuidInput = $("#node-input-deviceUuid");
            var ipInput = $("#node-input-deviceIp");
            var firmwareInput = $("#node-input-deviceFirmware");
            var deviceInfo = $("#device-info");
            var panelType = $("#node-input-panelType");
            var displayConfig = $("#display-config");
            var ampioAuto = $("#node-input-ampioAuto");
            var manualIpInput = $("#node-input-manualIp");

            // Create the scan button and device list if they don't exist
            if (!scanButton.length) {
                $("#device-container").append(
                    '<button type="button" id="node-input-scan-devices" ' +
                    'class="red-ui-button">' +
                    '<i class="fa fa-search"></i> Scan Network</button>' +
                    '<select id="node-input-device-list" style="width: 100%; margin-top: 10px;">' +
                    '<option value="">Select device...</option></select>' +
                    '<div id="device-info" style="margin-top: 10px; color: #666;"></div>'
                );
                
                scanButton = $("#node-input-scan-devices");
                deviceList = $("#node-input-device-list");
                deviceInfo = $("#device-info");
            }

            // Function to update panel list
            node.updatePanelList = function() {
                if (node.availablePanels) {
                    macInput.empty().append('<option value="">Select panel...</option>');
                    node.availablePanels.forEach(panel => {
                        const option = $('<option></option>')
                            .val(panel.mac.toString())
                            .text(panel.nazwa_urzadzenia + ' (' + panel.mac + ')');
                        if (panel.mac.toString() === node.macPanel) {
                            option.prop('selected', true);
                        }
                        macInput.append(option);
                    });
                }
            };

            // Handle panel selection
            macInput.change(function() {
                node.macPanel = $(this).val();
            });

            // Initial panel list update
            node.updatePanelList();

            // ... rest of the existing oneditprepare code ...
        }
    });
}
