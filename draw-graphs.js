// helper for graphs.
const bitrateSeries = {};
const bitrateGraphs = {};
const framerateSeries = {};
const framerateGraphs = {};
const qpSeries = {};
const qpGraphs = {};
let lastSendResult;
let lastRecvResult;

// Only for Firefox.
let ssrc2track;

// Show a stream and draw graphs.
function show(stream, isRemote) {
    const id = isRemote ? stream.id : 'local';

    const container = document.createElement('div');
    container.id = id + 'Container';
    container.style.display = 'inline-flex';
    document.getElementById(isRemote ? 'remotes' : 'local').appendChild(container);
    document.getElementById(isRemote ? 'remotes' : 'local').appendChild(document.createElement('br'));

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

    const qpCanvas = document.createElement('canvas');
    qpCanvas.id = id + 'qpCanvas';
    qpCanvas.title = 'qp';
    container.appendChild(qpCanvas);

    const qpGraph = new TimelineGraphView(id + 'Container', id + 'qpCanvas');
    qpGraph.updateEndDate();

    qpSeries[id] = id === 'local' ? new Map() : new TimelineDataSeries();
    qpGraphs[id] = qpGraph;

    const current = document.createElement('span');
    current.id = id + '_currentData';
    current.style['padding-left'] = '10px';
    current.innerText = 'Stream: ' + id;
    container.appendChild(current);
}

async function draw(pc1, pc2) {
    const res1 = await pc1.getSenders()[0].getStats();
    const sentKeyframes = {};
    const encoders = {};
    res1.forEach((report) => {
        if (report.type !== 'outbound-rtp') return;
        const graphName = 'local';
        const now = report.timestamp;
        const bytes = report.bytesSent;
        const frames = report.framesEncoded;
        // For non-spec simulcast there is no rid.
        sentKeyframes[report.rid || report.ssrc] = report.keyFramesEncoded;
        encoders[report.rid] = report.encoderImplementation;
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

            // calculate qp-per-frame
            if (report.qpSum) {
                const qp = (report.qpSum - lastSendResult.get(report.id).qpSum) /
                    (report.framesEncoded - lastSendResult.get(report.id).framesEncoded);
                if (!qpSeries[graphName].has(ssrc)) {
                    const series = new TimelineDataSeries();
                    qpSeries[graphName].set(ssrc, series);
                    if (qpSeries[graphName].size === 2) {
                        series.setColor('green');
                    } else if (qpSeries[graphName].size === 3) {
                        series.setColor('blue');
                    }
                }
                qpSeries[graphName].get(ssrc).addPoint(now, qp);
            }
        }
    });
    if (document.getElementById('local_currentData')) {
        document.getElementById('local_currentData').innerText = 'Stream: local\n' + Object.keys(sentKeyframes).sort().map(rid => {
            return 'rid=' + rid + ': keyframes=' + sentKeyframes[rid] + (encoders[rid] ? ', encoder=' + encoders[rid] : '');
        }).join('\n');
    }
    bitrateGraphs['local'].setDataSeries(Array.from(bitrateSeries['local'].values()));
    bitrateGraphs['local'].updateEndDate();

    framerateGraphs['local'].setDataSeries(Array.from(framerateSeries['local'].values()));
    framerateGraphs['local'].updateEndDate();

    qpGraphs['local'].setDataSeries(Array.from(qpSeries['local'].values()));
    qpGraphs['local'].updateEndDate();

    lastSendResult = res1;

    const res2 = await pc2.getStats();
    res2.forEach((report) => {
        if (report.type !== 'inbound-rtp') return;
        const now = report.timestamp;
        const bytes = report.bytesReceived;
        const frames = report.framesDecoded;
        if (lastRecvResult && lastRecvResult.get(report.id)) {
            let graphName;
            if (adapter.browserDetails.browser === 'firefox') {
                const graphId = ssrc2track.indexOf(report.ssrc >>> 0);
                graphName = ['low', 'mid', 'hi'][graphId];
            } else {
                // Prefer inbound-rtp.trackIdentifier, fall back to deprecated track stats trackIdentifier.
                graphName = report.trackIdentifier || res2.get(report.trackId).trackIdentifier;
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

            // calculate qp-per-frame
            if (report.qpSum) {
                const qp = (report.qpSum - lastRecvResult.get(report.id).qpSum) /
                    (report.framesDecoded - lastRecvResult.get(report.id).framesDecoded);
                qpSeries[graphName].addPoint(now, qp);
                qpGraphs[graphName].setDataSeries([qpSeries[graphName]]);
                qpGraphs[graphName].updateEndDate();
            }

            if (document.getElementById(graphName + '_currentData')) {
                document.getElementById(graphName + '_currentData').innerText =
                    'Stream: ' + graphName +
                    '\nmid=' + report.mid +
                    '\nkeyframes=' + report.keyFramesDecoded +
                    (report.decoderImplementation ? '\ndecoder=' + report.decoderImplementation : '\n');
            }
        }
    });
    lastRecvResult = res2;
}
