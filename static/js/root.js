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

// tries to parse JSON returns {} on any failure
var safeJSONparse = function(text) {
    // how wrong is a wild-card catch in JS?
    try {
        return JSON.parse(text);
    } catch(e) {
        return {};
    }
};

// fetch state as json, pass decoded object to callback arg
// returns jquery jqxhr handle
var getState = function(success) {
    // this is me not caring about wrapping the deferred
    return $.get('/clientdata').done(function(json) {
        success(safeJSONparse(json));
    });
};

// state object is passed to JSON.stringify
var setState = function(state) {
    return $.post('/clientdata', {data: JSON.stringify(state)});
};

var updateState = function(key, value) {
    return getState(function(state) {
        state[key] = value;
        // would prefer to return this deferred.. $.when.done? dont care enough
        setState(state);
    });
};

var storeposition = function(id, pos) {
    updateState(id + '.pos', pos)
        .fail(function(_, msg) {
            console.log("failed to update position: " + msg);
        });
};

var getposition = function(id, callback) {
    return getState(function(state) {
        callback(state[id + '.pos']);
    });
};

var restoreposition = function(id) {
    getposition(id, function(pos) {
        if (pos !== undefined) {
            jsPlumb.repaint($('#' + id).offset(pos));
        }
    });
};

// deferred object fetching most recent stdout data for streampeeker
var getRecentStream = function(sysId, stream) {
    return $.get('/' + sysId + '/stream/' + stream + '.bin?numbytes=100');
};

// Stream peeker is like a small dumb terminal window showing a stream's most
// recent output
var addstreampeeker = function(cmdSysId, stream) {
    var id = 'streampeeker-' + cmdSysId + '-' + stream;
    // open / collapse button
    var $ocbutton = $('<button>');
    // preview box
    var $preview = $('<pre>');
    var $sp = $('<div class=streampeeker id=' + id + '><pre>')
        .resizable()
        .append($ocbutton)
        .append($preview)
        .appendTo('body');
    // Closure that fills the stream peeker with stdout data every second until
    // it is closed
    var refresher;
    var dontrefresh = function() {};
    var dorefresh = function() {
        getRecentStream(cmdSysId, stream).done(function(data) {
            if ($sp.hasClass('open')) {
                $preview.text(data);
                jsPlumb.repaint($sp);
                // continue refreshing
                window.setTimeout(refresher, 1000);
            }
        });
    };
    // functions that open / collapse the streampeeker
    var openf, collapsef;
    openf = function() {
        $sp.removeClass('collapsed');
        $sp.addClass('open');
        $ocbutton.text('▬');
        $ocbutton.unbind('click', openf);
        $ocbutton.bind('click', collapsef);
        $sp.resizable({
            resize: function(e, ui) {
                jsPlumb.repaint(ui.helper);
            }})
        jsPlumb.repaint($sp);
        refresher = dorefresh;
        refresher();
    };
    collapsef = function() {
        $sp.removeClass('open');
        $sp.addClass('collapsed');
        $preview.empty();
        $ocbutton.text('◳');
        $ocbutton.unbind('click', collapsef);
        $ocbutton.bind('click', openf);
        $sp.resizable('destroy');
        jsPlumb.repaint($sp);
        refresher = dontrefresh;
    };
    collapsef();
    jsPlumb.draggable($sp, {
        stop: function(e, ui) {
            storeposition(this.id, ui.offset);
        }});
    jsPlumb.addEndpoint(id, {
        anchor: 'TopCenter',
        isTarget: true,
        endpoint: 'Rectangle',
    });
    // if there is already a configured position restore that
    restoreposition(id);
    return $sp;
};

var stream2anchor = function(stream) {
    return {stderr: "RightMiddle", stdout: "BottomCenter"}[stream]
};

var anchor2stream = function(anchor) {
    return {RightMiddle: "stderr", BottomCenter: "stdout"}[anchor];
};

var connectVisually = function(srcSysId, trgtSysId, stream, withstreampeeker) {
    var anchor = stream2anchor(stream);
    var $src = $('#cmd' + srcSysId);
    var $trgt = $('#cmd' + trgtSysId);
    jsPlumb.connect({
        source: $src,
        target: $trgt,
        anchors: [anchor, "TopCenter"],
    });
    if (withstreampeeker) {
        var $sp = addstreampeeker(srcSysId, stream);
        jsPlumb.connect({
            source: $src,
            target: $sp,
            anchors: [anchor, "TopCenter"],
        });
    }
};

var connect = function(srcSysId, trgtSysId, stream) {
    $.post('/' + srcSysId + '/connect?noredirect', {
        stream: stream,
        to: trgtSysId,
    }).done(function() {
        connectVisually(srcSysId, trgtSysId, stream, true);
    });
};

// analogous to CL's function by the same name
var constantly = function(val) {
    return function() { return val; }
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
        $node.resizable({
            resize: function(e, ui) {
                jsPlumb.repaint(ui.helper);
            }});
        jsPlumb.draggable($node, {
            stop: function(e, ui) {
                storeposition(this.id, ui.offset);
            }});
        jsPlumb.addEndpoint(cmd.htmlid, {
            anchor: 'TopCenter',
            isTarget: true,
            parameters: {
                sysid: constantly(cmd.nid),
            },
        });
        jsPlumb.addEndpoint(cmd.htmlid, {
            anchor: 'BottomCenter',
            isSource: true,
            parameters: {
                stream: constantly("stdout"),
                sysid: constantly(cmd.nid),
            },
        });
        jsPlumb.addEndpoint(cmd.htmlid, {
            anchor: 'RightMiddle',
            isSource: true,
            parameters: {
                stream: constantly("stderr"),
                sysid: constantly(cmd.nid),
            },
        });
    });
    // Second iteration to ensure that connections are only made after all
    // nodes have configured endpoints
    $.map(cmds, function(cmd, i) {
        if (cmd.hasOwnProperty('stdoutto')) {
            connectVisually(cmd.nid, cmd.stdoutto, 'stdout', true);
        }
        if (cmd.hasOwnProperty('stderrto')) {
            connectVisually(cmd.nid, cmd.stderrto, 'stderr', true);
        }
    });
    jsPlumb.importDefaults({ConnectionsDetachable: false});
    jsPlumb.bind("beforeDrop", function(info) {
        // Connected to another command
        connect(
            info.connection.endpoints[0].getParameter("sysid")(),
            info.dropEndpoint.getParameter("sysid")(),
            info.connection.getParameter("stream")());
        return false;
    });
    // ajaxify start command button
    $('form.start-cmd').submit(function(e) {
        $.post(this.action + "?noredirect", $(this).serialize())
            .done(function() {
                $(this).html('⌚');
            }).fail(function() {
                $(this).html('✗');
            });
        return false;
    });
    // Auto complete
    $('form[action="/new"] input[name="name"]').autocomplete({source: "/new/names.json"});
    // parse prompt
    $('div#prompt form').submit(function(e) {
        var argv = $('input', this).val().split(/\s+/);
        var data = {
            name: argv[0],
            stdoutScrollback: 1000,
            stderrScrollback: 1000,
        };
        for (var i = 1; i < argv.length; i++) {
            data['arg' + i] = argv[i];
        }
        $.post('/new', data).always(function() { window.location.reload(true); });
        return false;
    });
});
