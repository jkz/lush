// Copyright © 2013 Hraban Luyat <hraban@0brg.net>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.


// Scripting for root page

// websocket connection for control events
var ctrl;

// build jquery node containing [start] button that starts cmd in background
var makeStartButton = function (sysId) {
    return $('<form method=post action="/' + sysId + '/start" class="start-cmd"><button>start</button></form>')
        .submit(function (e) {
            $.post(this.action + "?noredirect", $(this).serialize())
                .done(function () {
                    // substitute the entire form by a glyph indicating status
                    $(e.target).html('⌚');
                    repeatExec(function () {
                        var info;
                        $.ajax({
                            url: '/' + sysId + '/info.json',
                            async: false,
                            dataType: "json",
                            success: function (infoobj) {
                                info = infoobj;
                            },
                            error: function () {
                                info = {Exited: true, Error: true};
                            }});
                        if (info.Exited == null) {
                            // not done yet continue polling
                            return true;
                        }
                        // done!
                        if (info.Error) {
                            $(e.target).html('✗');
                        } else {
                            $(e.target).html('✓');
                            var cmd = cmds[sysId];
                            // only archive group leaders
                            if (cmd.userdata.autoarchive && cmd.getGroupId() == sysId) {
                                archiveCmdTree(sysId);
                            }
                        }
                        return false;
                    }, 1000);
                }).fail(function () {
                    $(e.target).html('✗');
                });
            return false;
        });
};

// set the status info for this command in the given jquery node's content
var setStatNode = function (sysId, stat, $node) {
    var content;
    switch(stat) {
    case 0:
        content = makeStartButton(sysId);
        break;
    case 1:
        content = '⌚';
        break;
    case 2:
        content = '✓';
        break;
    case 3:
        content = '✗';
        break;
    }
    return $node.empty().append(content);
};

// fetch state as json, pass decoded object to callback arg
// returns jquery jqxhr handle
var getState = function (success) {
    // this is me not caring about wrapping the deferred
    return $.get('/clientdata').done(function (json) {
        success(safeJSONparse(json));
    });
};

// state object is passed to JSON.stringify
var setState = function (state) {
    return $.post('/clientdata', {data: JSON.stringify(state)});
};

var updateState = function (key, value) {
    return getState(function (state) {
        state[key] = value;
        // would prefer to return this deferred.. $.when.done? dont care enough
        setState(state);
    });
};

var storeposition = function (id, pos) {
    updateState(id + '.pos', pos)
        .fail(function (_, msg) {
            console.log("failed to update position: " + msg);
        });
};

var getposition = function (id, callback) {
    return getState(function (state) {
        callback(state[id + '.pos']);
    });
};

var restoreposition = function (id) {
    getposition(id, function (pos) {
        if (pos !== undefined) {
            jsPlumb.repaint($('#' + id).offset(pos));
        }
    });
};

// deferred object fetching most recent stream data for streampeeker
var getRecentStream = function (sysId, stream) {
    return $.get('/' + sysId + '/stream/' + stream + '.bin?numbytes=100');
};

// Stream peeker is like a small dumb terminal window showing a stream's most
// recent output
var addstreampeeker = function (srcep) {
    var cmdSysId = srcep.getParameter("sysid")();
    var stream = srcep.getParameter("stream")();
    var id = 'streampeeker-' + cmdSysId + '-' + stream;
    // open / collapse button
    var $ocbutton = $('<button>');
    // preview box
    var $preview = $('<pre class=monitor-stream>').data('stream', stream);
    var $sp = $('<div class=streampeeker id=' + id + '><pre>')
        .resizable()
        .append($ocbutton)
        .append($preview)
        .appendTo('body');
    // Closure that fills the stream peeker with stdout data every second until
    // it is closed
    var refresher;
    var dontrefresh = function () {};
    var dorefresh = function () {
        getRecentStream(cmdSysId, stream).done(function (data) {
            repeatExec
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
    openf = function () {
        $sp.removeClass('collapsed');
        $sp.addClass('open');
        $ocbutton.text('▬');
        $sp.resizable({
            resize: function (e, ui) {
                jsPlumb.repaint(ui.helper);
            }})
        jsPlumb.repaint($sp);
        refresher = dorefresh;
        refresher();
        $ocbutton.one('click', collapsef);
    };
    collapsef = function () {
        $sp.removeClass('open');
        $sp.addClass('collapsed');
        $preview.empty();
        $ocbutton.text('◳');
        $sp.resizable('destroy');
        jsPlumb.repaint($sp);
        refresher = dontrefresh;
        $ocbutton.one('click', openf);
    };
    collapsef();
    jsPlumb.draggable($sp, {
        stop: function (e, ui) {
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
        parameters: { isStreampeek: true },
    });
    return $sp;
};

var stream2anchor = function (stream) {
    return {stderr: "RightMiddle", stdout: "BottomCenter"}[stream]
};

var anchor2stream = function (anchor) {
    return {RightMiddle: "stderr", BottomCenter: "stdout"}[anchor];
};

// the two first arguments are the source and target endpoints to connect
var connectVisually = function (srcep, trgtep, stream) {
    jsPlumb.connect({
        source: srcep,
        target: trgtep,
    });
};

var connect = function (srcep, trgtep, stream) {
    var srcSysId = srcep.getParameter("sysid")();
    var trgtSysId = trgtep.getParameter("sysid")();
    $.post('/' + srcSysId + '/connect?noredirect', {
        stream: stream,
        to: trgtSysId,
    }).done(function () {
        connectVisually(srcep, trgtep, stream);
        rebuildGroupsList();
    });
};

// create dom node with a button that when clicked will prepare this
// command for repeating (argv -> prompt, focus prompt)
var createRepeatButton = function (sysid) {
    return $('<button>↻</button>').click(function () {
            term.set_command(cmds[sysid].argv.join(' ')).focus();
        });
};

var helpAction = function (cmd) {
    switch (cmd.argv[0]) {
    case 'tar':
        return function (cmd) {
            window.open('http://unixhelp.ed.ac.uk/CGI/man-cgi?tar', '_blank');
        };
    }
    return null;
};

// help link in command widget to explain command and flags
var createHelpLink = function (cmd) {
    var action = helpAction(cmd);
    if (!action) {
        return null;
    }
    return $('<a href="" class=cmdhelp>(help)</a>')
        .click(function () {
            action(cmd);
            return false;
        });
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
var createCmdWidget = function (cmd) {
    var $widget = $(
        '<div class=cmdwidget id="' + cmd.htmlid + '">' +
        '<a href="/' + cmd.nid + '/">' + cmd.nid + ': ' +
        '<tt>' + cmd.argv.join(" ") + ' </tt> </a>')
        .append(setStatNode(cmd.nid, cmd.status, $('<span>')))
        .append(createRepeatButton(cmd.nid))
        .append(createHelpLink(cmd));
    $('#cmds').append($widget);
    restoreposition(cmd.htmlid);
    $widget.resizable({
        resize: function (e, ui) {
            jsPlumb.repaint(ui.helper);
        }});
    jsPlumb.draggable($widget, {
        stop: function (e, ui) {
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
    cmd.getGroupId = function () {
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
    // Doubleclicking a source endpoint creates a streampeeker
    $.map([cmd.stdoutep, cmd.stderrep], function (ep) {
        $(ep.canvas)
            .css('z-index', 4) // put endpoint above the connector (is at 3)
            .one('dblclick', function() {
                addstreampeeker(ep);
            });
    });
    return $widget;
};

// Recursively apply fun to all cmds that this cmd is a source of and then
// apply fun to this cmd itself
var mapCmdTree = function (sysid, f) {
    var cmd = cmds[sysid];
    // for every connected stdout and stderr stream:
    $.map(jsPlumb.getConnections({source: cmd.htmlid}), function (conn) {
        if (conn.getParameter("isStreampeek")) {
            return;
        }
        // stdin endpoint that this stream is connected to
        var trgtep = conn.endpoints[1];
        // recurse into those before continuing
        mapCmdTree(trgtep.getParameter("sysid")(), f);
    });
    f(cmd);
};

// hide command widget, including meta widgets (streampeek)
var hideCmd = function (cmd) {
    $.map(jsPlumb.getConnections({source: cmd.htmlid}), function (conn) {
        conn.setVisible(false);
        conn.endpoints[1].setVisible(false);
        if (conn.getParameter('isStreampeek')) {
            jsPlumb.repaint(conn.target.css('display', 'none'));
        }
    });
    $.map(jsPlumb.getEndpoints(cmd.htmlid), function (ep) {
        ep.setVisible(false);
    });
    jsPlumb.repaint($('#' + cmd.htmlid).css('display', 'none'));
};

var showCmd = function (cmd) {
    $.map(jsPlumb.getConnections({source: cmd.htmlid}), function (conn) {
        conn.setVisible(true);
        conn.endpoints[1].setVisible(true);
        if (conn.getParameter('isStreampeek')) {
            jsPlumb.repaint(conn.target.css('display', 'block'));
        }
    });
    $.map(jsPlumb.getEndpoints(cmd.htmlid), function (ep) {
        ep.setVisible(true);
    });
    jsPlumb.repaint($('#' + cmd.htmlid).css('display', 'block'));
};

// purely visual
var hideCmdTree = function (sysid) {
    mapCmdTree(sysid, hideCmd);
    $('#group' + sysid).addClass('archived');
};

// purely visual
var showCmdTree = function (sysid) {
    mapCmdTree(sysid, showCmd);
    $('#group' + sysid).removeClass('archived');
};

// archive not only visually but also update configuration
var archiveCmdTree = function (sysid) {
    hideCmdTree(sysid);
    updateState('group' + sysid + '.' + 'archived', true);
};

// archive not only visually but also update configuration
var unarchiveCmdTree = function (sysid) {
    showCmdTree(sysid);
    updateState('group' + sysid + '.' + 'archived', false);
};

// map(sysid => cmdobj) to map(groupid => [cmdobj])
var makeGroups = function (cmds) {
    return groupby(cmds, function (cmd) { return cmd.getGroupId(); });
};

// refresh the <ul id=groups>
var rebuildGroupsList = function (groups) {
    if (groups === undefined) {
        groups = makeGroups(cmds);
    }
    var lis = $.map(groups, function (cmds, gid) {
        var names = $.map(cmds, attrgetter("name")).join(", ");
        var $li = $('<li id=group' + gid + '>' + gid + ': ' + names + '</li>');
        var $btn = $('<button>').click(function () {
            if ($li.hasClass('archived')) {
                unarchiveCmdTree(gid);
            } else {
                archiveCmdTree(gid);
            }
            return false;
        });
        return $li.append($btn);
    });
    var $g = $('#groups ul').empty().append(lis);
    // process configuration of archived groups
    getState(function (state) {
        $.map(groups, function (_, gid) {
            if (state['group' + gid + '.archived']) {
                hideCmdTree(gid);
            }
        });
    });
    return $g;
};

var chdir = function (dir) {
    // this here is some tricky code dupe
    $.post("/chdir", {dir: dir})
        .fail(function (_, status, error) {
            alert(status + ": " + error);
        });
};

// print text to this terminal's output and mark it as coming from this
// command. sets a class in the div that holds the output in the terminal.
var termPrintlnCmd = function (term, sysid, data) {
    var finalize = function (container) {
        container.addClass('output-' + sysid);
    };
    return termPrintln(term, data, finalize);
};

var mynum = 0;

// page-local increasing number
var nextNum = function () {
    return mynum++;
};

var createPathInput = function (dir) {
    var id = 'path-' + nextNum();
    return $('<div id='+id+'>').append([
        // when a path changes submit the entire new path
        $('<input>')
            .val(dir)
            .change(function () {
                $('form#path').submit();
            })
            .keypress(function () {
                var w = ((this.value.length + 1) * 8);
                if (w < 200) {
                    w = 200;
                }
                this.style.width = w + 'px';
            })
            .keypress(),
        // delete path button
        $('<button>×</button>').click(function () {
            $('#'+id).remove();
            // when a path is removed submit the entire new path
            $('form#path').submit();
            return false;
        }),
    ]);
};

// Initialization for the PATH UI
var initPathForm = function(ctrl) {
    // Hook up form submission to ctrl channel
    $('form#path')
        .submit(function () {
            var paths = $.map($('#path input'), attrgetter('value'));
            // filter out empty paths
            paths = $.grep(paths, identity);
            ctrl.send('setpath', JSON.stringify(paths));
            return false;
        })
        // + button to allow creating entirely new PATH entries
        .after($('<button>+</button>').click(function () {
            $('form#path').append(createPathInput(''))
            return false;
        }));
    // Refresh form when server notifies PATH changes
    ctrl.handleEvent("path", function (pathjson) {
        var dirs = JSON.parse(pathjson);
        $('form#path')
            .empty()
            .append($.map(dirs, createPathInput));
    });
    // Request initial PATH from server
    ctrl.ws.onopen = function () {
        ctrl.send("getpath");
    };
};

loadScript('/js/ctrl.js', function () {
    ctrl = new Ctrl();
    ctrl.ws.onerror = function () {
        console.log('Error connecting to ' + ctrluri);
    };
    // a new command has been created
    ctrl.handleEvent("newcmd", function (cmdjson) {
        var cmd = JSON.parse(cmdjson);
        cmds[cmd.nid] = cmd;
        createCmdWidget(cmd);
        rebuildGroupsList();
        // capture all stdout and stderr to terminal
        ctrl.handleStream(cmd.nid, "stdout", curry(termPrintlnCmd, term, cmd.nid));
        ctrl.handleStream(cmd.nid, "stderr", curry(termPrintlnCmd, term, cmd.nid));
        // auto start by simulating keypress on [start]
        if (cmd.userdata.autostart) {
            $('#' + cmd.htmlid + ' form.start-cmd').submit();
        }
    });
    initPathForm(ctrl);
});

$(document).ready(function () {
    $.map(cmds, createCmdWidget);
    // Second iteration to ensure that connections are only made after all
    // nodes have configured endpoints
    $.map(cmds, function (cmd) {
        if (cmd.hasOwnProperty('stdoutto')) {
            // connect my stdout to cmd.stdoutto's stdin
            connectVisually(cmd.stdoutep, cmds[cmd.stdoutto].stdinep, 'stdout');
        }
        if (cmd.hasOwnProperty('stderrto')) {
            connectVisually(cmd.stderrep, cmds[cmd.stderrto].stdinep, 'stderr');
        }
    });
    var groups = makeGroups(cmds);
    rebuildGroupsList(groups);
    $('<a href>show/hide archived</a>')
        .click(function () { $('#groups .archived').toggle(); return false; })
        .insertBefore('#groups ul');
    jsPlumb.importDefaults({
        ConnectionsDetachable: false,
        // Put all connectors at z-index 3 and endpoints at 4
        ConnectorZIndex: 3,
    });
    jsPlumb.bind("beforeDrop", function (info) {
        // Connected to another command
        connect(
            info.connection.endpoints[0],
            info.dropEndpoint,
            info.connection.getParameter("stream")());
        return false;
    });
    // Auto complete
    $('form[action="/new"] input[name="cmd"]').autocomplete({source: "/new/names.json"});
    // set command name to argv
    $('form[action="/new"]')
        .append($('<input type=hidden name=name>'))
        // ajaxify creation of new command, send it over ctrl stream
        .submit(function () {
            var argv = $.map($('input[name=cmd], input[name^=arg]', this), attrgetter('value'));
            argv = removeFalse(argv);
            if (argv[0] == "cd") {
                chdir(argv[1]);
                return false;
            }
            $('input[name=name]', this).val(argv.join(' '));
            var o = $(this).serializeObject();
            // cast numeric inputs to JS ints
            $.each(o, function (key, val) {
                if (/^\d+$/.test(val)) {
                    o[key] = parseInt(val);
                }
            });
            o.args = argv.slice(1);
            o.userdata = $(this).data();
            // special case: always auto start & archive prompt commands
            var fromprompt = (o.userdata.creator == 'prompt');
            o.userdata.autostart = fromprompt || this.autostart.checked;
            o.userdata.autoarchive = fromprompt || this.autoarchive.checked;
            ctrl.send("new", JSON.stringify(o));
            // reset creator field
            $(this).removeData('creator');
            return false;
        });
    // persistent checkbox configurations
    var $flags = $('input[type=checkbox]').change(function () {
        updateState('flag.' + this.id, $(this).is(':checked'));
    });
    getState(function (state) {
        $flags.each(function () {
            $(this).prop('checked', state['flag.' + this.id]);
        });
    });
    term = createTerminal();
});
