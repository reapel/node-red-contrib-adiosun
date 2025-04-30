module.exports = function(RED) {
    // Dodajemy funkcję testową dla MQTT
    RED.httpAdmin.get("/adiosun/mqtt/test", RED.auth.needsPermission('adiosun.read'), function(req, res) {
        const broker = req.query.broker;
        const port = req.query.port;
        const username = req.query.username;
        const password = req.query.password;
        
        console.log("Test połączenia MQTT:", broker + ":" + port);
        
        const mqtt = require('mqtt');
        const url = 'mqtt://' + broker + ':' + port;
        
        const client = mqtt.connect(url, {
            username: username,
            password: password,
            connectTimeout: 5000
        });
        
        let connected = false;
        
        client.on('connect', function() {
            console.log('MQTT Test - Połączono pomyślnie!');
            connected = true;
            client.end();
            res.json({status: "success", message: "Połączono pomyślnie z MQTT"});
        });
        
        client.on('error', function(err) {
            console.log('MQTT Test - Błąd:', err);
            client.end();
            res.json({status: "error", message: "Błąd połączenia: " + err.message});
        });
        
        // Timeout
        setTimeout(function() {
            if (!connected) {
                console.log('MQTT Test - Timeout');
                client.end();
                res.json({status: "error", message: "Timeout - brak odpowiedzi od brokera MQTT"});
            }
        }, 5000);
    });
    
    function AdiosunConfigNode(config) {
        RED.nodes.createNode(this, config);
        this.broker = config.broker;
        this.port = config.port;
        this.username = config.username;
        this.password = config.password;
        this.macPanel = config.macPanel;
        
        // Store the complete broker URL
        this.brokerUrl = 'mqtt://' + this.broker + ':' + this.port;
        
        // Make connection details available to other nodes
        this.getMQTTConfig = function() {
            return {
                broker: this.brokerUrl,
                username: this.username,
                password: this.password,
                macPanel: this.macPanel
            };
        };
    }
    RED.nodes.registerType("adiosun-config", AdiosunConfigNode);
}
