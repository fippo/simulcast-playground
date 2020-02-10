// helper for graphs.
const bitrateSeries = {};
const bitrateGraphs = {};
const framerateSeries = {};
const framerateGraphs = {};
let lastSendResult;
let lastRecvResult;

// Only for Firefox.
let ssrc2track;

function draw(pc1, pc2) {
    pc1.getSenders()[0].getStats().then((res) => {
        res.forEach((report) => {
            if (report.type === 'outbound-rtp') {
                const now = report.timestamp;
                const bytes = report.bytesSent;
                const frames = report.framesEncoded;
                if (lastSendResult && lastSendResult.get(report.id)) {
                    const graphName = 'local';

                    // calculate bitrate
                    const bitrate = 8000 * (bytes - lastSendResult.get(report.id).bytesSent) /
                        (now - lastSendResult.get(report.id).timestamp);

                    bitrateSeries[graphName].addPoint(now, bitrate);
                    bitrateGraphs[graphName].setDataSeries([bitrateSeries[graphName]]);
                    bitrateGraphs[graphName].updateEndDate();

                    //  calculate framerate.
                    const framerate = 1000 * (frames - lastSendResult.get(report.id).framesEncoded) /
                        (now - lastSendResult.get(report.id).timestamp);
                    framerateSeries[graphName].addPoint(now, framerate);
                    framerateGraphs[graphName].setDataSeries([framerateSeries[graphName]]);
                    framerateGraphs[graphName].updateEndDate();
                }
            }
        });
        lastSendResult = res;
    });
    pc2.getStats().then((res) => {
        res.forEach((report) => {
            if (report.type === 'inbound-rtp') {
                const now = report.timestamp;
                const bytes = report.bytesReceived;
                const frames = report.framesDecoded;
                if (lastRecvResult && lastRecvResult.get(report.id)) {
                    let graphName;
                    if (adapter.browserDetails.browser === 'firefox') {
                        const graphId = ssrc2track.indexOf(report.ssrc >>> 0);
                        graphName = ['low', 'mid', 'hi'][graphId];
                    } else {
                        graphName = res.get(report.trackId).trackIdentifier;
                    }
                    if (!bitrateSeries[graphName]) {
                        return;
                    }

                    // calculate bitrate
                    const bitrate = 8000 * (bytes - lastRecvResult.get(report.id).bytesReceived) /
                        (now - lastRecvResult.get(report.id).timestamp);

                    bitrateSeries[graphName].addPoint(now, bitrate);
                    bitrateGraphs[graphName].setDataSeries([bitrateSeries[graphName]]);
                    bitrateGraphs[graphName].updateEndDate();

                    //  calculate framerate.
                    const framerate = 1000 * (frames - lastRecvResult.get(report.id).framesDecoded) /
                        (now - lastRecvResult.get(report.id).timestamp);
                    framerateSeries[graphName].addPoint(now, framerate);
                    framerateGraphs[graphName].setDataSeries([framerateSeries[graphName]]);
                    framerateGraphs[graphName].updateEndDate();
                }
            }
        });
        lastRecvResult = res;
    });
}
