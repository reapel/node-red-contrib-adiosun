# node-red-contrib-adiosun

A Node-RED node for controlling Adiosun MQTT devices with advanced network and button interaction capabilities.

## Features

- Automatic device discovery on local network
- MQTT communication with Adiosun devices
- Real-time track and device status management
- Support for both icon and text display modes
- Volume control and playback management
- Notification system integration
- Ampio panel integration

## Installation

```bash
npm install node-red-contrib-adiosun
```

Or install directly from the Node-RED Palette Manager.

## Usage

1. Add an Adiosun node to your flow
2. Configure the MQTT broker settings
3. Click "Scan Network" to discover Adiosun devices
4. Select your device from the list
5. Configure display settings (icons or text mode)
6. Deploy and start controlling your device

### Node Configuration

- **Panel ID**: Unique identifier for your Ampio panel (max 7 characters)
- **Panel Type**: Choose between:
  - 4 Icons and Text
  - 3 Lines of Text
- **Display Number**: For icon mode (1-12)
- **Line Number**: For text mode (1-3)
- **Auto-configure Ampio**: Automatically set up Ampio panel integration

### Input Messages

The node accepts messages with the following properties:

```javascript
{
    "topic": "command",
    "payload": {
        "command": "play/pause/next/prev/volume",
        "value": "command-specific-value"
    }
}
```

### Output Messages

The node outputs status messages in the format:

```javascript
{
    "topic": "status",
    "payload": {
        "artist": "Artist Name",
        "title": "Track Title",
        "volume": 50,
        "status": "playing/paused"
    }
}
```

## Requirements

- Node.js >= 14.0.0
- Node-RED >= 2.0.0
- Local network access to Adiosun devices
- MQTT broker

## License

MIT License
