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
var addstreampeeker = function(srcep) {
    var cmdSysId = srcep.getParameter("sysid")();
    var stream = srcep.getParameter("stream")();
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
    var myep = jsPlumb.addEndpoint(id, {
        anchor: 'TopCenter',
        isTarget: true,
        endpoint: 'Rectangle',
    });
    // if there is already a configured position restore that
    restoreposition(id);
    // connect to the source endpoint (create a new endpoint on the source dynamically)
    jsPlumb.connect({
        source: srcep.getElement(),
        target: myep,
        anchors: [stream2anchor(stream), myep],
    });
    return $sp;
};

var stream2anchor = function(stream) {
    return {stderr: "RightMiddle", stdout: "BottomCenter"}[stream]
};

var anchor2stream = function(anchor) {
    return {RightMiddle: "stderr", BottomCenter: "stdout"}[anchor];
};

// the two first arguments are the source and target endpoints to connect
var connectVisually = function(srcep, trgtep, stream, withstreampeeker) {
    jsPlumb.connect({
        source: srcep,
        target: trgtep,
    });
    if (withstreampeeker) {
        addstreampeeker(srcep);
    }
};

var connect = function(srcep, trgtep, stream) {
    var srcSysId = srcep.getParameter("sysid")();
    var trgtSysId = trgtep.getParameter("sysid")();
    $.post('/' + srcSysId + '/connect?noredirect', {
        stream: stream,
        to: trgtSysId,
    }).done(function() {
        connectVisually(srcep, trgtep, stream, true);
        rebuildGroupsList();
    });
};

// analogous to CL's function by the same name
var constantly = function(val) {
    return function() { return val; }
};

// create widget with command info and add it to the DOM
// the argument is a cmd object implementation defined by the cmds array in
// root.html
//
// jsPlumb endpoints:
// widgets have three endpoints: stdin, stdout and stderr. these endoints are
// jsPlumb.Endpoint objects and their reference is needed to connect them to
// eachother. this function creates the endpoints and stores their reference in
// the cmd argument object as .stdinep, .stdoutep and .stderrep.
var createCmdWidget = function(cmd) {
    var $widget = $(
        '<div class="cmd" id="' + cmd.htmlid + '">' +
        '<a href="/' + cmd.nid + '/">' + cmd.nid + ': ' +
        '<tt>' + cmd.argv.join(" ") + '</tt></a> ' +
        stat2html(cmd.nid, cmd.status) + '</p>');
    $('#cmds').append($widget);
    restoreposition(cmd.htmlid);
    $widget.resizable({
        resize: function(e, ui) {
            jsPlumb.repaint(ui.helper);
        }});
    jsPlumb.draggable($widget, {
        stop: function(e, ui) {
            storeposition(this.id, ui.offset);
        }});
    cmd.stdinep = jsPlumb.addEndpoint($widget, {
        anchor: 'TopCenter',
        isTarget: true,
        parameters: {
            sysid: constantly(cmd.nid),
        },
    });
    // function that returns:
    //
    // - the group id of the "source command" (cmd that this div's source
    //   endpoint is connected to), if any
    //
    // - the system id of this command otherwise
    cmd.getGroupId = function() {
        if (cmd.stdinep.connections.length > 0) {
            var conn = cmd.stdinep.connections[0];
            return conn.getParameter("groupid")();
        }
        return cmd.nid;
    };
    cmd.stdoutep = jsPlumb.addEndpoint($widget, {
        anchor: 'BottomCenter',
        isSource: true,
        parameters: {
            stream: constantly("stdout"),
            sysid: constantly(cmd.nid),
            groupid: cmd.getGroupId,
        },
    });
    cmd.stderrep = jsPlumb.addEndpoint($widget, {
        anchor: 'RightMiddle',
        isSource: true,
        parameters: {
            stream: constantly("stderr"),
            sysid: constantly(cmd.nid),
            groupid: cmd.getGroupId,
        },
    });
    return $widget;
};

// transform an array of objects into a mapping from key to array of objects
// with that key.
// compare to SQL's GROUP BY, with a custom function to evaluate which group an
// object belongs to.
var groupby = function(objs, keyfun) {
    var groups = {};
    $.map(objs, function(obj) {
        key = keyfun(obj);
        // [] if no such group yet
        groups[key] = (groups[key] || []).concat(obj);
    });
    return groups;
}

// map(sysid => cmdobj) to map(groupid => [cmdobj])
var makeGroups = function(cmds) {
    return groupby(cmds, function (cmd) { return cmd.getGroupId(); });
};

// refresh the <ul id=groups>
var rebuildGroupsList = function() {
    var lis = [];
    $.map(makeGroups(cmds), function(cmds, gid) {
        var cmdids = $.map(cmds, function(cmd) { return cmd.nid; }).join(", ");
        var $li = $('<li>' + gid + ': ' + cmdids + '</li>');
        lis.push($li);
    });
    var $list = $('#groups');
    return $list.empty().append(lis);
}

$(document).ready(function() {
    $.map(cmds, createCmdWidget);
    // Second iteration to ensure that connections are only made after all
    // nodes have configured endpoints
    $.map(cmds, function(cmd) {
        if (cmd.hasOwnProperty('stdoutto')) {
            // connect my stdout to cmd.stdoutto's stdin
            connectVisually(cmd.stdoutep, cmds[cmd.stdoutto].stdinep, 'stdout', true);
        }
        if (cmd.hasOwnProperty('stderrto')) {
            connectVisually(cmd.stderrep, cmds[cmd.stderrto].stdinep, 'stderr', true);
        }
    });
    rebuildGroupsList();
    jsPlumb.importDefaults({ConnectionsDetachable: false});
    jsPlumb.bind("beforeDrop", function(info) {
        // Connected to another command
        connect(
            info.connection.endpoints[0],
            info.dropEndpoint,
            info.connection.getParameter("stream")());
        return false;
    });
    // ajaxify start command button
    $('form.start-cmd').submit(function(e) {
        $.post(this.action + "?noredirect", $(this).serialize())
            .done(function() {
                $(e.target).html('⌚');
            }).fail(function() {
                $(e.target).html('✗');
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
