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

"use strict";

// Scripting for root page
//
// sorry for the mess
//
// general idea:
//
// COMMAND OBJECTS
//
// commands are represented in the global array "cmds" as objects (usually
// called "cmd" when assigned to a variable). there is no spec on the
// properties in a cmd object (frowny face) but you can get the idea from a
// couple places:
//
// metacmd.go defines serialization of the cmd object from the server side.
// this is where a cmd object comes to life as a JSON object
//
// that json thing finds its way to the createCmdWidget function. there a
// widget is created and initialized for the command and some extra stuff is
// added to the cmd object like functions and more properties.
//
// sounds good to me what could possibly go wrong?
//
// WIDGETS
//
// thats what I call those draggable boxes that represent a command in the UI
//
// CONTROL STREAM
//
// this script opens a websocket connection to /ctrl where the client and
// server talk to eachother about food and fashion and larry king. shockingly,
// there is no spec for this, either. check out websocket.go for the messages
// that the server can handle. check out every line of every .js file to see
// what messages the client can handle. or grep $(ctrl).on in this file thats
// probably easier. see ctrl.js for details. in code. haha what you thought in
// documentation?
//
// Note that websocket messages are broadcasted to every connected client.
// There is no request/reply system even though it does look like that its
// slightly different. This is mostly relevant when you have multiple connected
// clients.
//
// Eg when you want to get the path. You say "getpath", but the server doesnt
// really reply with the path. okay it kinda does but this is about the idea
// bear (haha) (thats the lamest joke since the invention of paper) with me
// here.
//
// what it does is send (wow i still cant believe i made that bear joke) "This
// is the path: " message to all clients. the server can do that whenever
// it wants, for whatever reason. it HAPPENS to only do it when a client
// requests it or when the path changes, but the client doesnt treat it that
// way. what it does is whenever the "path" websocket message comes in (look
// for $(ctrl).on("path", ...)) it updates the entire UI with this new path.
// THEN it says "hey server send me the path" ("getpah"), knowing that when it
// does, the handling of the response is in place.
//
// so basically instead of this (in order of execution):
//
// 1 ask question
// 2 get answer
// 3 handle answer
//
// the code does this:
//
// 1 handle answer (ctrl.handleEvent(...))
// 2 ask question (ctrl.send())
// 3 get answer
//
// that bear joke wasn't even a double meaning i just misspelled something and
// it happened to be another word. oh my god. hilarity.
//
// the path example is simplest but a lot of command related messaging also
// works this way. this helps in making the whole thing asynchronous and also
// easily scales to > 1 clients; when you get an answer you handle it, even if
// you didn't ask a question.
//
// good luck.

define(["jquery",
        "lush/Ctrl",
        "lush/terminal",
        "lush/path",
        "lush/help",
        "jsPlumb",
        "lush/utils"],
       function ($,
                 Ctrl,
                 terminal,
                 path,
                 help) {

    // websocket connection for control events
    var ctrl;

    // jQuery terminal plugin object
    var term;

    // sometimes i just dont know who i am anymore...
    var moi = guid();

    // build jquery node containing [▶] button that starts cmd in background
    var makeStartButton = function (sysId) {
        return $('<button class=start>▶</button>').click(function (e) {
            $(e.target).html('⌚');
            $(e.target).prop('disabled', true);
            ctrl.send('start', sysId);
            // stop bubbling: prevent terminal from losing focus
            return false;
        });
    };

    // build jquery node containing [◼] button that stops the cmd in background
    var makeStopButton = function (sysId) {
        return $('<button class=stop>◼</button>').click(function (e) {
            $(e.target).html('⌚');
            $(e.target).prop('disabled', true);
            ctrl.send('stop', sysId);
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
            content = makeStopButton(sysId);
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

    // deferred object fetching most recent stream data for streampeeker
    var getRecentStream = function (sysId, stream) {
        return $.get('/' + sysId + '/stream/' + stream + '.bin?numbytes=100');
    };

    // store position of this DOM node on the server as userdata.
    //
    // call this whenever a synced node moved. can't do that automatically
    // because there was some whining about cross browser ladida idk just hook
    // this in the postMove handlers manually.
    //
    // assuming a <div id=myhtmlid> at x=123 and y=58008
    //
    // generated event:
    //
    // setuserdata;position.myhtmlid;{"left": 123, "top": 58008}
    //
    // causes the server to broadcast a userdata event to all connected
    // websocket clients (including this one!), as it is wont to do:
    //
    // userdata.position.myhtmlid;{"left": 123, "top": 58008}
    var storePosition = function (node) {
        var posjson = JSON.stringify($(node).offset());
        ctrl.send("setuserdata", 'position_' + node.id, posjson);
    };

    // when the server says this node was moved, actually move the node in the
    // UI. also asks the server what the current position is to initialize the
    // position correctly.
    // if a second argument is supplied it is called every time the position
    // changes.
    var syncPosition = function (node, extraCallback) {
        $(ctrl).on('userdata_position.' + node.id, function (e, offsetJSON) {
            var offset = safeJSONparse(offsetJSON);
            if (offset) {
                $(node).offset(offset);
                if (extraCallback) {
                    extraCallback.call(node);
                }
            }
        });
        ctrl.send('getuserdata', 'position_' + node.id);
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
            stop: function () { storePosition(this); },
        });
        var myep = jsPlumb.addEndpoint(id, {
            anchor: 'TopCenter',
            isTarget: true,
            endpoint: 'Rectangle',
        });
        // connect to the source endpoint (create a new endpoint on the source dynamically)
        var connection = jsPlumb.connect({
            source: srcep.getElement(),
            target: myep,
            anchors: [stream2anchor(stream), myep],
            parameters: { isStreampeek: true },
        });
        syncPosition($sp[0], function () {
            jsPlumb.repaint($(this));
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
        var options = {
            from: srcep.getParameter("sysid")(),
            to: trgtep.getParameter("sysid")(),
            stream: stream,
        };
        ctrl.send('connect', JSON.stringify(options));
    };

    var switchModeToView = function ($widget) {
        $widget.removeClass('editmode');
        $widget.removeClass('helpmode');
        $widget.addClass('viewmode');
        jsPlumb.repaint($widget);
    };

    var initViewTab = function (cmd, $widget) {
        var $viewm = $('.tab_view', $widget);
        // static parts of the UI (depend on constant cmd property "nid")
        $('.link', $viewm).attr('href', '/' + cmd.nid + '/');
        $('.linktext', $viewm).text(cmd.nid + ': ');
        // when clicked will prepare this command for repeating (argv ->
        // prompt, focus prompt)
        $('.repeat', $viewm).click(function () {
            term.set_command(cmd.argv.join(' ')).focus();
        });
        $('.bookmark', $viewm).attr('href', '#prompt;' + cmd.argv.join(' '));
        $('.editbtn', $viewm).click(function () {
            $widget.removeClass('viewmode');
            $widget.addClass('editmode');
            jsPlumb.repaint($widget);
        });
        var $helplink = $('.helplink', $viewm).click(function (e) {
            e.preventDefault();
            $widget.removeClass('viewmode');
            $widget.addClass('helpmode');
            jsPlumb.repaint($widget);
        });
        // dynamic parts of the UI
        $(cmd).on('update', function () {
            setStatNode(this.nid, this.status, $('.status', $viewm));
            var action = help(this);
            if (action) {
                $helplink.show();
            } else {
                // no help action? hide the link
                $helplink.hide();
            }
            $('.argv', $viewm).text(this.argv.join(" "));
            if (this.status > 0) {
                $('.editbtn', $viewm).remove();
            }
        });
    };

    var initEditTab = function (cmd, $widget) {
        var $editm = $('.tab_edit', $widget);
        $('[name=nid]', $editm).val(cmd.nid);
        $('[name=cmd]', $editm).autocomplete({source: "/new/names.json"});
        $('.cancelbtn', $editm).click(function () {
            // restore form contents from model
            $(cmd).trigger('update');
            switchModeToView($widget);
        });
        var lastarg = 1;
        var addarg = function () {
            $('[name=arg' + lastarg + ']', $editm).after(
                $('<input size=10 name=arg' + (++lastarg) + '>')
                    .one('keydown', addarg));
        };
        $('[name=arg1]', $editm).one('keydown', addarg);
        // send "updatecmd" message over ctrl stream.  server will reply with
        // updatecmd, which will invoke a handler to update the cmd object,
        // which will invoke $(cmd).trigger('update'), which will invoke the
        // handler that updates the view for viewmode (<div class=view>).
        $('form', $editm).submit(function (e) {
            e.preventDefault();
            var argv = $.map($('input[name=cmd], input[name^=arg]', this), attrgetter('value'));
            argv = removeFalse(argv);
            var o = $(this).serializeObject();
            // cast numeric inputs to JS ints
            $.each(o, function (key, val) {
                if (/^\d+$/.test(val)) {
                    o[key] = parseInt(val);
                }
            });
            // set command name to argv
            o.name = argv.join(' ');
            o.args = argv.slice(1);
            o.userdata = $(this).data();
            o.userdata.autostart = this.autostart.checked;
            o.userdata.autoarchive = this.autoarchive.checked;
            ctrl.send("updatecmd", JSON.stringify(o));
            switchModeToView($widget);
        });
        $(cmd).on('update', function () {
            $('[name=cmd]', $editm).val(this.argv[0]);
            this.argv.slice(1).forEach(function (arg, idx) {
                // keydown triggers the "create new arg input" handler
                $('[name=arg' + (idx + 1) + ']', $editm).val(arg).keydown();
            });
            $('[name=stdoutScrollback]', $editm).val(cmd.stdoutScrollback)
            $('[name=stderrScrollback]', $editm).val(cmd.stderrScrollback)
            $('[name=autostart]', $editm)[0].checked = this.userdata.autostart;
            $('[name=autoarchive]', $editm)[0].checked = this.userdata.autoarchive;
        });
    };

    // initialize a widget's help view
    var initHelpTab = function (cmd, $widget) {
        var $help = $('.tab_help', $widget);
        $(cmd).on('update', function () {
            // clean out help div
            $help.empty();
            var action = help(this);
            if (action) {
                action(this, $help, curry(switchModeToView, $widget), ctrl);
            }
        });
    };

    // Init the command view (the V in MVC) given the model (the cmd).
    var initView = function (cmd, $widget) {
        initViewTab(cmd, $widget);
        initEditTab(cmd, $widget);
        initHelpTab(cmd, $widget);
        // initialize view
        $(cmd).trigger('update');
    };

    var createStreamPeekerWhenDblClicked = function (ep) {
        return $(ep.canvas)
            .css('z-index', 4) // put endpoint above the connector (is at 3)
            .one('dblclick', function() {
                addstreampeeker(ep);
            });
    };

    var updatePipes = function (cmd) {
        if (cmd.hasOwnProperty('stdoutto')) {
            // connect my stdout to cmd.stdoutto's stdin
            connectVisually(cmd.stdoutep, cmds[cmd.stdoutto].stdinep, 'stdout');
        }
        if (cmd.hasOwnProperty('stderrto')) {
            connectVisually(cmd.stderrep, cmds[cmd.stderrto].stdinep, 'stderr');
        }
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
    //
    // Hooks view updaters to a custom jQuery event 'update'. I.e. after
    // changing the cmd run $(cmd).trigger('update') to update the UI.
    var createCmdWidget = function (cmd) {
        // Fresh command widget in view mode
        var $widget = $('#cmdwidget_template')
            .clone()
            .attr("id", cmd.htmlid)
            .addClass("viewmode");
        initView(cmd, $widget);
        $('#cmds').append($widget);
        syncPosition($widget[0], function () {
            jsPlumb.repaint($(this));
        });
        // jsPlumb stuff
        $widget.resizable({
            resize: function () {
                jsPlumb.repaint($(this));
            }
        });
        jsPlumb.draggable($widget, {
            stop: function () { storePosition(this); },
        });
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
        createStreamPeekerWhenDblClicked(cmd.stdoutep);
        createStreamPeekerWhenDblClicked(cmd.stderrep);
        // true iff this command does not take its stdin from another command
        cmd.isRoot = function () {
            return cmd.stdinep.connections.length == 0;
        }
        $(cmd).on('update', function () {
            // only archive group leaders
            if (this.userdata.autoarchive &&
                this.status == 2 &&
                this.isRoot() &&
                // only god archives a command, the rest will follow indirectly
                this.userdata.god == moi) {
                setGroupArchivalStatus(this.nid, true);
            }
            updatePipes(this);
            // this call must come after updatePipes because figuring out group
            // relations is done through the jsPlumb connections. not very
            // pretty imo i wouldnt mind better separation between model and
            // view but thats how its currently implemented.
            rebuildGroupsList();
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

    // set userdata to '(un)archived', rely on event handler for this key to do
    // the actual archiving when the server replies to this event
    var setGroupArchivalStatus = function (sysid, state) {
        var archivals = $('#groups').data('archivals');
        if (archivals === undefined) {
            throw "archivals uninitialized";
        }
        archivals[sysid] = state;
        ctrl.send('setuserdata', 'groups_archived', JSON.stringify(archivals));
    };

    // map(sysid => cmdobj) to map(groupid => [cmdobj])
    var makeGroups = function (cmds) {
        return groupby(cmds, function (cmd) { return cmd.getGroupId(); });
    };

    // refresh the <ul id=groups>
    var rebuildGroupsList = function () {
        var groups = makeGroups(cmds);
        var lis = $.map(groups, function (cmds, gid) {
            var names = $.map(cmds, attrgetter("name")).join(", ");
            var $li = $('<li id=group' + gid + '>' + gid + ': ' + names + '</li>');
            var $btn = $('<button>').click(function (e) {
                e.preventDefault();
                setGroupArchivalStatus(gid, !$li.hasClass('archived'));
            });
            return $li.append($btn);
        });
        return $('#groups ul').empty().append(lis);
    };

    var initGroupsList = function () {
        $(ctrl).on('userdata_groups_archived', function (_, archivalsjson) {
            // eg {1: true, 2: false, 3: false};
            var archivals = safeJSONparse(archivalsjson) || {};
            // update local archivals status with that from server
            $('#groups').data('archivals', archivals);
            $.each(archivals, function (gid, state) {
                if (state) {
                    hideCmdTree(gid);
                } else {
                    showCmdTree(gid);
                }
            });
        });
        rebuildGroupsList();
        // initialize the UI with current archival status (if any)
        ctrl.send('getuserdata', 'groups_archived')
    }

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
        return term.termPrintln(data, finalize);
    };

    var processCmd = function (options) {
        if (options.cmd == "cd") {
            chdir(options.args[0]);
        } else {
            // ensure userdata is an object (rest of the code depends on this)
            if (!$.isPlainObject(options.userdata)) {
                options.userdata = {};
            }
            options.userdata.god = moi;
            ctrl.send("new", JSON.stringify(options));
        }
    };

    // Handle what comes after the # on page load
    var processHash = function (h) {
        var i = h.indexOf(';');
        var rest = h.slice(i + 1);
        switch (h.slice(0, i)) {
        case "prompt":
            term.set_command(rest);
        }
    };

    $(document).ready(function () {
        // Control stream (Websocket)
        ctrl = new Ctrl();
        ctrl.ws.onerror = function () {
            console.log('Error connecting to ' + ctrluri);
        };
        $.each(cmds, function (_, cmd) { createCmdWidget(cmd); });
        // second iteration to ensure all widgets exist before connecting them
        $.each(cmds, function (_, cmd) { updatePipes(cmd); });
        initGroupsList();
        $('<a href>show/hide archived</a>')
            .click(function (e) {
                e.preventDefault();
                $('#groups .archived').toggle();
            })
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
        $('button#newcmd').click(function () {
            // create an empty command
            processCmd({});
        });
        $('.sortable').disableSelection().sortable();
        // a new command has been created
        $(ctrl).on("newcmd", function (_, cmdjson) {
            var cmd = JSON.parse(cmdjson);
            cmds[cmd.nid] = cmd;
            createCmdWidget(cmd);
            rebuildGroupsList();
            if (cmd.userdata.god == moi) {
                // i made this!
                // capture all stdout and stderr to terminal
                var printer = function (_, data) {
                    termPrintlnCmd(term, cmd.nid, data);
                };
                $(cmd).on('stdout.stream', printer);
                $(cmd).on('stderr.stream', printer);
                // subscribe to stream data
                ctrl.send('subscribe', cmd.nid, 'stdout');
                ctrl.send('subscribe', cmd.nid, 'stderr');
                var $widget = $('#' + cmd.htmlid);
                if (cmd.userdata.autostart) {
                    // auto start by simulating click on [▶]
                    $('button.start', $widget).click();
                } else {
                    // If not autostarting, go directly into edit mode
                    $('.editbtn', $widget).click();
                }
            }
        });
        // command has been updated
        $(ctrl).on("updatecmd", function (_, updatejson) {
            var update = JSON.parse(updatejson);
            var cmd = cmds[update.nid];
            cmd = $.extend(cmd, update);
            $(cmd).trigger('update');
        });
        path($('form#path'), ctrl);
        term = terminal(processCmd);
        if (window.location.hash) {
            processHash(window.location.hash.slice(1));
        }
        // proxy the stream event to the command object
        // comes in as: stream;1;stdout;foo bar
        // the normal event handling causes the 'stream' event to trigger
        // that's this one. it transforms the event into a new one:
        // "stdout.stream" with event data "foo bar" on the cmd object
        $(ctrl).on('stream', function (_, rawopts) {
            var opts = rawopts.splitn(';', 3);
            var sysid = opts[0];
            var stream = opts[1];
            var data = opts[2];
            $(cmds[sysid]).trigger(stream + '.stream', data);
        });
    });

});
