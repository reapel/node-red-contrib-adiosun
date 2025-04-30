module.exports = function(RED) {
    const axios = require('axios');

    // Stałe endpointy dla każdej funkcji
    const ENDPOINTS = {
        onepause: "/httpapi.asp?command=setPlayerCmd:onepause",
        resume: "/httpapi.asp?command=setPlayerCmd:resume",
        pause: "/httpapi.asp?command=setPlayerCmd:pause",
        next: "/httpapi.asp?command=setPlayerCmd:next",
        prev: "/httpapi.asp?command=setPlayerCmd:prev",
        volU: "/httpapi.asp?command=setPlayerCmd:volU",
        volD: "/httpapi.asp?command=setPlayerCmd:volD",
        "vol:": "/httpapi.asp?command=setPlayerCmd:vol:",
        mute: "/httpapi.asp?command=setPlayerCmd:mute",
        unmute: "/httpapi.asp?command=setPlayerCmd:unmute",
        wifi: "/httpapi.asp?command=setPlayerCmd:wifi",
        bt: "/httpapi.asp?command=setPlayerCmd:bt",
        analog1: "/httpapi.asp?command=setPlayerCmd:analog1",
        usb: "/httpapi.asp?command=setPlayerCmd:usb",
        "MCUKeyShortClick:": "/httpapi.asp?command=setPlayerCmd:MCUKeyShortClick:",
        stop: "/httpapi.asp?command=setPlayerCmd:stop",
        "playPromptUrl:": "/httpapi.asp?command=playPromptUrl:"
    };

    function AdiosunCommandNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        
        // Store configuration
        node.name = config.name;
        node.deviceIp = config.deviceIp;
        node.deviceName = config.deviceName;
        node.command = config.command;
        node.notificationUrl = config.notificationUrl;

        // Handle incoming messages
        node.on('input', function(msg) {
            if (!node.deviceIp) {
                node.error("Nie wybrano urządzenia");
                return;
            }

            if (!node.command) {
                node.error("Nie wybrano komendy");
                return;
            }

            // Pobierz endpoint dla wybranej komendy
            const endpoint = ENDPOINTS[node.command];
            if (!endpoint) {
                node.error("Nieznana komenda: " + node.command);
                return;
            }

            // Build the full command
            let fullCommand = endpoint;
            if (node.command === "playPromptUrl:") {
                if (!node.notificationUrl) {
                    node.error("Nie podano URL-a notyfikacji");
                    return;
                }
                fullCommand += node.notificationUrl;
            } else if (msg.payload !== undefined && (node.command === "vol:" || node.command === "MCUKeyShortClick:")) {
                fullCommand += msg.payload;
            }

            // Build the URL
            const url = `http://${node.deviceIp}${fullCommand}`;
            
            // Send the HTTP request
            axios.get(url, {
                timeout: 2000
            })
            .then(response => {
                // Send the response as output
                node.send({
                    payload: response.data,
                    status: "success"
                });
                
                // Update node status
                node.status({
                    fill: "green",
                    shape: "dot",
                    text: "Komenda wysłana"
                });
            })
            .catch(error => {
                node.error("Błąd wysyłania komendy: " + error.message);
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: "Błąd wysyłania komendy"
                });
            });
        });

        // Clean up on close
        node.on('close', function() {
            node.status({});
        });
    }

    // Register the node type
    RED.nodes.registerType("adiosun-command", AdiosunCommandNode);
}; 