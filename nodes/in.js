const WirenboardHelper = require('../lib/WirenboardHelper.js');

var mqtt = require('mqtt');

module.exports = function(RED) {
    class WirenboardNodeIn {
        constructor(config) {
            RED.nodes.createNode(this, config);

            var node = this;
            node.config = config;
            node.firstMsg = true;
            node.is_subscribed = false;
            node.cleanTimer = null;
            node.server = RED.nodes.getNode(node.config.server);
            node.cachedPayload = null;

            if (typeof(node.config.channel) == 'string') node.config.channel = [node.config.channel]; //for compatible

            node.status({}); //clean

            if (node.server) {
                node.listener_onMQTTConnect = function(data) { node.onMQTTConnect(); }
                node.server.on('onMQTTConnect', node.listener_onMQTTConnect);

                node.listener_onConnectError = function(data) { node.onConnectError(); }
                node.server.on('onConnectError', node.listener_onConnectError);

                node.listener_onMQTTMessage = function(data) { node.onMQTTMessage(data); }
                node.server.on('onMQTTMessage', node.listener_onMQTTMessage);

                node.on('close', () => this.onMQTTClose());

                if (typeof(node.server.mqtt) === 'object') {
                    node.onMQTTConnect();
                }
            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "node-red-contrib-wirenboard/in:status.no_server"
                });
            }
        }

        onConnectError(status = null) {
            var node = this;
            node.status({
                fill: "red",
                shape: "dot",
                text: "node-red-contrib-wirenboard/in:status.no_connection"
            });
        }

        onMQTTClose() {
            var node = this;

            //remove listeners
            if (node.listener_onMQTTConnect) {
                node.server.removeListener('onMQTTConnect', node.listener_onMQTTConnect);
            }
            if (node.listener_onConnectError) {
                node.server.removeListener('onConnectError', node.listener_onConnectError);
            }
            if (node.listener_onMQTTMessage) {
                node.server.removeListener("onMQTTMessage", node.listener_onMQTTMessage);
            }

            node.onConnectError();
        }

        onMQTTConnect() {
            var node = this;

            node.status({
                fill: "green",
                shape: "dot",
                text: "node-red-contrib-wirenboard/in:status.connected"
            });

            // node.cleanTimer = setTimeout(function () {
            //     node.status({}); //clean
            // }, 3000);
        }

        onMQTTMessage(data) {
            var node = this;

            if(node.hasChannelError(data.topic)) {

                if(data.payload !== '') {
                    switch(data.payload) {
                        case 'r':
                            node.status({
                                fill: "red",
                                shape: "dot",
                                text: "node-red-contrib-wirenboard/in:status.error_reading"
                            });
                            break;
                        default:
                            node.setStatus({
                                fill: "red",
                                shape: "dot",
                                text: RED._("node-red-contrib-wirenboard/in:status.error_undefined", {error: data.payload})
                            });
                    }
                } else {
                    node.status({fill: "green", shape: "dot", text: node.cachedPayload});
                }

                return;
            }

            if (node.hasChannel(data.topic)) {
                
                node.status({fill: "green", shape: "dot", text: data.payload});
                node.cachedPayload = data.payload;

                if (node.isSingleChannelMode()) {
                    if (node.firstMsg && !node.config.outputAtStartup) {
                        node.firstMsg = false;
                        return;
                    }

                    node.send({
                        payload: data.payload,
                        topic: data.topic,
                        selector: WirenboardHelper.generateSelector(data.topic)
                    });
                } else {
                    var data_array = WirenboardHelper.prepareDataArray(node.server, node.config.channel);

                    if (node.firstMsg && !node.config.outputAtStartup && data_array.has_null) {
                        return;
                    }
                    node.firstMsg = false;

                    node.send({
                        payload: data_array.data,
                        data_array: data_array.data_full,
                        math: data_array.math,
                        event: {
                            payload: data.payload,
                            topic:data.topic,
                            selector: WirenboardHelper.generateSelector(data.topic)
                        }
                    });

                    node.cleanTimer = setTimeout(function () {
                        node.status({}); //clean
                    }, 3000);
                }
            }
        }

        isSingleChannelMode() {
            return (this.config.channel).length === 1;
        }

        hasChannelError(channel) {
            var node = this;

            if(!channel.endsWith('/meta/error')) {
                return false;
            }

            return this.hasChannel(channel.replace('/meta/error', ''));
        }

        hasChannel(channel) {
            var node = this;

            return node.config.channel.includes(channel);
        }
    }
    RED.nodes.registerType('wirenboard-in', WirenboardNodeIn);
};



