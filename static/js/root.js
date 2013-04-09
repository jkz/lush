var stat2html = function(nid, stat) {
    switch(stat) {
    case 0:
        return '<form method=post action="/' + nid + '/start" class="start-cmd"> <button>start</button> </form>';
    case 1:
        return '⌚';
    case 2:
        return '✓';
    case 3:
        return '✗';
    }
};

var storeposition = function(id, pos) {
    localStorage.setItem(id + '.left', '' + pos.left);
    localStorage.setItem(id + '.top', '' + pos.top);
};

var getposition = function(id) {
    var left = localStorage.getItem(id + '.left');
    var top = localStorage.getItem(id + '.top');
    if (left === null || top === null) {
        return null;
    }
    return {left: +left, top: +top};
};

var restoreposition = function(id) {
    var pos = getposition(id);
    if (pos !== null) {
        $('#' + id).offset(pos);
    }
};

var stream2anchor = function(stream) {
    return {stderr: "RightMiddle", stdout: "BottomCenter"}[stream]
};

var anchor2stream = function(anchor) {
    return {RightMiddle: "stderr", BottomCenter: "stdout"}[anchor];
};

var connectVisually = function(srcId, trgtId, stream) {
    jsPlumb.connect({
        source: srcId,
        target: trgtId,
        anchors: [stream2anchor(stream), "TopCenter"],
    });
};

var connect = function(srcId, trgtId, stream) {
    srcNId = +srcId.substring(3);
    trgtNId = +trgtId.substring(3);
    $.post('/' + srcNId + '/connect?noredirect', {
        stream: stream,
        to: trgtNId,
    }).done(function() {
        connectVisually(srcId, trgtId, stream);
    });
};

$(document).ready(function() {
    $.map(cmds, function(cmd, i) {
        var $node = $(
            '<div class="cmd" id="' + cmd.htmlid + '">' +
            '<a href="/' + cmd.nid + '/">' + cmd.nid + ': ' +
            '<tt>' + cmd.argv.join(" ") + '</tt></a> ' +
            stat2html(cmd.nid, cmd.status) + '</p>');
        $('#cmds').append($node);
        restoreposition(cmd.htmlid);
        jsPlumb.draggable($node, {
            stop: function(e, ui) {
                storeposition(this.id, ui.offset);
            }});
        jsPlumb.addEndpoint(cmd.htmlid, {
            anchor: 'TopCenter',
            isTarget: true,
        });
        jsPlumb.addEndpoint(cmd.htmlid, {
            anchor: 'BottomCenter',
            isSource: true,
        });
        jsPlumb.addEndpoint(cmd.htmlid, {
            anchor: 'RightMiddle',
            isSource: true,
        });
    });
    // Second iteration to ensure that connections are only made after all
    // nodes have configured endpoints
    $.map(cmds, function(cmd, i) {
        if (cmd.hasOwnProperty('stdoutto')) {
            connectVisually(cmd.htmlid, 'cmd' + cmd.stdoutto, 'stdout');
        }
        if (cmd.hasOwnProperty('stderrto')) {
            connectVisually(cmd.htmlid, 'cmd' + cmd.stderrto, 'stderr');
        }
    });
    jsPlumb.importDefaults({ConnectionsDetachable: false});
    jsPlumb.bind("beforeDrop", function(info) {
        connect(
            info.connection.sourceId,
            info.connection.targetId,
            anchor2stream(info.connection.endpoints[0].anchor.type));
        return false;
    });
    // ajaxify start command button
    $('form.start-cmd').submit(function(e) {
        $.post(e.target.action + "?noredirect", $(this).serialize())
        .done(function() {
            $(e.target).html('⌚');
        }).fail(function() {
            $(e.target).html('✗');
        });
        return false;
    });
    // Auto complete
    $('form[action="/new"] input[name="name"]').autocomplete({source: "/new/names.json"});
});
