function assert_active(pc1, pc2, layerToDeactivate) {
    // make assertions about setting a layers active flags
    var sender = pc1.getSenders()[0]
    var param = sender.getParameters();
    param.encodings[layerToDeactivate].active = false;
    sender.setParameters(param);
    // now assert on pc2.getReceivers()[0].getStats() that no packets are received
    setTimeout(() => {
        pc2.getReceivers()[0].getStats().then(initialStats => {
            setTimeout(() => {
                pc2.getReceivers()[0].getStats().then(subsequentStats => {
                    subsequentStats.forEach(s => {
                        if (s.type === 'inbound-rtp') {
                            // should be 0
                            console.log('low-res track bytes received in last second', s.bytesReceived - initialStats.get(s.id).bytesReceived);
                        }
                    });
                });
            });
        }, 1000); // query stats for 1 second
    }, 1000); // wait 1 second
}

function assert_bitrate(pc1, pc2, layer, maxBitrate) {
    // make assertions about setting maxBitrate
    var sender = pc1.getSenders()[0]
    var param = sender.getParameters();
    param.encodings[1].maxBitrate = 100000;
    sender.setParameters(param);
    // now assert on pc2.getReceivers()[1].getStats() that ~100kbps are received
    setTimeout(() => {
        pc2.getReceivers()[1].getStats().then(initialStats => {
            setTimeout(() => {
                pc2.getReceivers()[1].getStats().then(subsequentStats => {
                    subsequentStats.forEach(s => {
                        if (s.type === 'inbound-rtp') {
                            console.log('mid-res track bytes received in last second', 8000 * (s.bytesReceived - initialStats.get(s.id).bytesReceived) / (s.timestamp - initialStats.get(s.id).timestamp))
                        }
                    });
                });
            }, 1000); // query stats for 1 second
        });
    }, 1000); // wait 1 second
}
