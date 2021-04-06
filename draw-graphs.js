// helper for graphs.
const bitrateSeries = {};
const bitrateGraphs = {};
const framerateSeries = {};
const framerateGraphs = {};
let lastSendResult;
let lastRecvResult;

// Only for Firefox.
let ssrc2track;

// Show a stream and draw graphs.
function show(stream, isRemote) {
    const id = isRemote ? stream.id : 'local';

    const container = document.createElement('div');
    container.id = id + 'Container';
    document.getElementById(isRemote ? 'remotes' : 'local').appendChild(container);

    const v = document.createElement('video');
    v.autoplay = true;
    v.srcObject = stream;
    v.onresize = () => v.title = 'video dimensions: ' + v.videoWidth + 'x' + v.videoHeight;
    container.appendChild(v);

    const bitrateCanvas = document.createElement('canvas');
    bitrateCanvas.id = id + 'BitrateCanvas';
    bitrateCanvas.title = 'Bitrate';
    container.appendChild(bitrateCanvas);

    const bitrateGraph = new TimelineGraphView(id + 'Container', id + 'BitrateCanvas');
    bitrateGraph.updateEndDate();

    bitrateSeries[id] = id === 'local' ? new Map() : new TimelineDataSeries();
    bitrateGraphs[id] = bitrateGraph;

    const framerateCanvas = document.createElement('canvas');
    framerateCanvas.id = id + 'FramerateCanvas';
    framerateCanvas.title = 'Framerate';
    container.appendChild(framerateCanvas);

    const framerateGraph = new TimelineGraphView(id + 'Container', id + 'FramerateCanvas');
    framerateGraph.updateEndDate();

    framerateSeries[id] = id === 'local' ? new Map() : new TimelineDataSeries();
    framerateGraphs[id] = framerateGraph;
}

function draw(pc1, pc2) {
    pc1.getSenders()[0].getStats().then((res) => {
        const graphName = 'local';
        res.forEach((report) => {
            if (report.type === 'outbound-rtp') {
                const now = report.timestamp;
                const bytes = report.bytesSent;
                const frames = report.framesEncoded;
                if (lastSendResult && lastSendResult.get(report.id)) {
                    const ssrc = report.ssrc;

                    // calculate bitrate
                    const bitrate = 8000 * (bytes - lastSendResult.get(report.id).bytesSent) /
                        (now - lastSendResult.get(report.id).timestamp);
                    if (!bitrateSeries[graphName].has(ssrc)) {
                        const series = new TimelineDataSeries();
                        bitrateSeries[graphName].set(ssrc, series);
                        if (bitrateSeries[graphName].size === 2) {
                            series.setColor('green');
                        } else if (bitrateSeries[graphName].size === 3) {
                            series.setColor('blue');
                        }
                    }

                    if (bitrate >= 0) {
                        bitrateSeries[graphName].get(ssrc).addPoint(now, bitrate);
                    }

                    //  calculate framerate.
                    const framerate = 1000 * (frames - lastSendResult.get(report.id).framesEncoded) /
                        (now - lastSendResult.get(report.id).timestamp);
                    if (!framerateSeries[graphName].has(ssrc)) {
                        const series = new TimelineDataSeries();
                        framerateSeries[graphName].set(ssrc, series);
                        if (framerateSeries[graphName].size === 2) {
                            series.setColor('green');
                        } else if (framerateSeries[graphName].size === 3) {
                            series.setColor('blue');
                        }
                    }
                    if (framerate >= 0) {
                        framerateSeries[graphName].get(ssrc).addPoint(now, framerate);
                    }
                }
            }
        });
        bitrateGraphs[graphName].setDataSeries(Array.from(bitrateSeries[graphName].values()));
        bitrateGraphs[graphName].updateEndDate();

        framerateGraphs[graphName].setDataSeries(Array.from(framerateSeries[graphName].values()));
        framerateGraphs[graphName].updateEndDate();
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

