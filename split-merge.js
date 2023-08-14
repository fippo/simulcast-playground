const extensionsToFilter = [
    'urn:ietf:params:rtp-hdrext:sdes:mid',
    'urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id',
    'urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id',
];
function splitLayers(offer, {disableTransportCC, streamIds, rids}) {
    const sections = SDPUtils.splitSections(offer);
    const dtls = SDPUtils.getDtlsParameters(sections[1], sections[0]);
    const ice = SDPUtils.getIceParameters(sections[1], sections[0]);
    const rtpParameters = SDPUtils.parseRtpParameters(sections[1]);
    const rtcpParameters = SDPUtils.parseRtcpParameters(sections[1]);
    if (disableTransportCC) {
        // Disable transport-cc by filtering both the RTCP feedback and the extension.
        rtpParameters.codecs.forEach(codec => {
            codec.rtcpFeedback = codec.rtcpFeedback.filter(fb => fb.type !== 'transport-cc');
        });
        rtpParameters.headerExtensions = rtpParameters.headerExtensions.filter(ext => {
            return ext.uri !== 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01';
        });
    }

    // The gist of this hack is that rid and mid have the same wire format.
    // Kudos to orphis for this clever hack!
    const rid = rtpParameters.headerExtensions.find(ext => ext.uri === 'urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id');
    rtpParameters.headerExtensions = rtpParameters.headerExtensions.filter(ext => {
        return !extensionsToFilter.includes(ext.uri);
    });
    // This tells the other side that the RID packets are actually mids.
    rtpParameters.headerExtensions.push({id: rid.id, uri: 'urn:ietf:params:rtp-hdrext:sdes:mid', direction: 'sendrecv'});

    // Filter rtx as we have no way to reinterpret rrid. Not doing this makes probing use RTX, its not understood
    // and ramp-up is slower.
    rtpParameters.codecs = rtpParameters.codecs.filter(c => c.name.toUpperCase() !== 'RTX');

    // Filter RED as this makes wireshark dumps harder to read.
    rtpParameters.codecs = rtpParameters.codecs.filter(c => c.name.toUpperCase() !== 'RED');

    let sdp = SDPUtils.writeSessionBoilerplate() +
      SDPUtils.writeDtlsParameters(dtls, 'actpass') +
      SDPUtils.writeIceParameters(ice) +
      'a=group:BUNDLE ' + rids.join(' ') + '\r\n' +
      'a=msid-semantic:WMS *\r\n';
    // Use session-level header extensions to make the SDP shorter.
    rtpParameters.headerExtensions.forEach(ext => {
        sdp += SDPUtils.writeExtmap(ext);
    });
    rtpParameters.headerExtensions = [];

    const mSection = SDPUtils.writeRtpDescription('video', rtpParameters) +
        SDPUtils.writeRtcpParameters({
            mux: rtcpParameters.mux,
            reducedSize: rtcpParameters.reducedSize,
        });

    rids.forEach(rid => {
        sdp += mSection +
            'a=mid:' + rid + '\r\n' +
            'a=msid:' + streamIds[rid] + ' ' + streamIds[rid] + '\r\n';
    });
    return sdp;
}

function mergeLayers(answer, offer, {disableTransportCC, rids}) {
    const sections = SDPUtils.splitSections(answer);
    const dtls = SDPUtils.getDtlsParameters(sections[1], sections[0]);
    const ice = SDPUtils.getIceParameters(sections[1], sections[0]);
    const rtpParameters = SDPUtils.parseRtpParameters(sections[1]);
    const rtcpParameters = SDPUtils.parseRtcpParameters(sections[1]);
    // Avoid duplicating the mid extension even though Chrome does not care (boo!)
    rtpParameters.headerExtensions = rtpParameters.headerExtensions.filter(ext => {
        return !extensionsToFilter.includes(ext.uri);
    });
    let sdp = SDPUtils.writeSessionBoilerplate() +
      SDPUtils.writeDtlsParameters(dtls, 'active') +
      SDPUtils.writeIceParameters(ice) +
      'a=group:BUNDLE 0\r\n' +
      'a=msid-semantic:WMS *\r\n';
    // Use session-level header extensions to make the SDP shorter.
    rtpParameters.headerExtensions.forEach(ext => {
        sdp += SDPUtils.writeExtmap(ext);
    });
    rtpParameters.headerExtensions = [];
    // Re-add headerextensions we filtered.
    const headerExtensions = SDPUtils.parseRtpParameters(SDPUtils.splitSections(offer)[1]).headerExtensions;
    headerExtensions.forEach(ext => {
        if (remb && ext.uri === 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01') {
            return;
        }
        if (extensionsToFilter.includes(ext.uri)) {
            sdp += 'a=extmap:' + ext.id + ' ' + ext.uri + '\r\n';
        }
    });

    sdp += SDPUtils.writeRtpDescription('video', rtpParameters) +
        SDPUtils.writeRtcpParameters({
            mux:rtcpParameters.mux,
            reducedSize: rtcpParameters.reducedSize,
        });
    rids.forEach(rid => {
        sdp += 'a=rid:' + rid + ' recv\r\n';
    });
    sdp += 'a=simulcast:recv ' + rids.join(';') + '\r\n';
    sdp += 'a=mid:' + SDPUtils.getMid(SDPUtils.splitSections(offer)[1]) + '\r\n';
    return sdp;
}
