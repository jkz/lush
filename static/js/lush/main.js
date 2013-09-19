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
//
// EVENTS
//
// sooo im not really in the mood for writing documentation atm but this event
// pubsub thing (I think its pubsub but tbh the only thing I know about pubsub
// is what it stands for anyway judging from that I think this is pubsub :P) is
// getting out of hand i really need to write this down somewhere.
//
// soooooo.... ah yes there are loads of events flying around: websocket events
// and jquery events. this part is about the latter.
//
// window
//
//     there is one event that is triggered on the window object, it's the
//     newcmdcallback. i don't feel like explaining it here but you can search
//     the code for window.*on (and skip this sentence haha) and that should
//     explain it
//
// ctrl
//
//     all incoming websocket events are translated by the control object
//     (often (hopefully always) referred to by a var named ctrl) into jquery
//     events on itself. this part is pretty obvious and you can see how it
//     works by checking out Control.js and searching for ctrl.*on in other
//     parts of the code.
//
// cmd
//
//     this one is interesting: there is a whole range of implementation
//     defined events that are triggered on the command object. ill try to spec
//     them here but ill probably overlook a few.
//
//     - wasupdated: this one is triggered whenever the command object has
//     been updated. subscribe to this event if you want to stay in sync with
//     the command. what exactly has been updated can be extracted from the
//     first parameter (i.e. the second arg, bc its a jquery event so the
//     first arg is the jquery event object). that is an object containing
//     only the keys that have been updated, and their new values. this saves
//     the poor client the trouble of refreshing a view that didn't change.
//
//     - wasreleased: triggered when resources associated with a command have
//     been released by the server and the client wants to clean up the
//     command. any resources that will not be garbage collected automatically
//     should be freed here.
//
//     - stdout.stream / stderr.stream: called when the running command is
//     generating data on the relevant streams.
//
//     - archival: triggered when this command is being (un)archived. can be
//     caused by a server event, by the user minimizing the widget, or by a
//     parent widget being minimized. should not be propagated by registered
//     handlers (is propagated by the Command object). it is triggered when the
//     server updates cmd.userdata.archived (i.e. by a 'wasupdated' handler).
//     the parameter is a boolean that is true for archiving, false for
//     unarchiving.
//
//     - parentRemoved: this command is now a root. the argument is the old
//     parent.
//
//     - parentAdded: the argument is the new parent. note that commands can
//     only have one parent.
//
//     - childAdded: an output pipe of this command is now connected to another
//     command. the first parameter is the child, the second is the name of the
//     stream.
//
//     - childRemoved: an output pipe is disconnected from a command. the first
//     parameter is the command that was disconnected, the second is the name
//     of the stream.
//
// good luck.

define(["jquery",
        "lush/Ctrl",
        "lush/Command",
        "lush/terminal",
        "lush/path",
        "lush/help",
        "jsPlumb",
        "lush/utils"],
       function ($,
                 Ctrl,
                 Command,
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
    var makeStartButton = function (cmd) {
        return $('<button class=start>▶</button>').click(function (e) {
            $(e.target).html('⌚');
            $(e.target).prop('disabled', true);
            cmd.start();
            // stop bubbling: prevent terminal from losing focus
            return false;
        });
    };

    // build jquery node containing [◼] button that stops the cmd in background
    var makeStopButton = function (sysId) {
        return $('<button class=stop>◼</button>').click(function (e) {
            $(e.target).html('⌚');
            $(e.target).prop('disabled', true);
            ctrl.send('stop', cmd.nid);
        });
    };

    // set the status info for this command in the given jquery node's content
    var setStatNode = function (cmd, $node) {
        var content;
        switch (cmd.status) {
        case 0:
            content = makeStartButton(cmd);
            break;
        case 1:
            content = makeStopButton(cmd);
            break
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

    var switchToViewTab = function ($widget) {
        // view is always first. hack? who cares.
        $widget.tabs('option', 'active', 0);
    };

    var initViewTab = function (cmd, $widget) {
        var $viewm = $('.tab_view', $widget);
        // static parts of the UI (depend on constant cmd property "nid")
        $('.link', $viewm).attr('href', '/' + cmd.nid + '/');
        $('.linktext', $viewm).text(cmd.nid + ': ');
        // when clicked will prepare this command for repeating (argv ->
        // prompt, focus prompt)
        $('.repeat', $viewm).click(function () {
            term.set_command(cmd.getArgv().join(' ')).focus();
        });
        // dynamic parts of the UI
        $(cmd).on('wasupdated', function () {
            setStatNode(this, $('.status', $viewm));
            var argvtxt = cmd.getArgv().join(' ');
            $('.argv', $viewm).text(argvtxt);
            $('.bookmark', $viewm).attr('href', '#prompt;' + argvtxt);
            if (this.status > 0) {
                // todo: disable edit tab?
            }
        });
    };

    var initEditTab = function (cmd, $widget) {
        var $editm = $('.tab_edit', $widget);
        $('[name=cmd]', $editm).autocomplete({source: "/new/names.json"});
        $('.cancelbtn', $editm).click(function () {
            // restore form contents from model
            $(cmd).trigger('wasupdated');
            switchToViewTab($widget);
        });
        var lastarg = 1;
        var addarg = function () {
            $('[name=arg' + lastarg + ']', $editm).after(
                $('<input size=10 name=arg' + (++lastarg) + '>')
                    .one('keydown', addarg));
        };
        $('[name=arg1]', $editm).one('keydown', addarg);
        // request the command to be updated. behind the scenes this happens:
        // send "updatecmd" message over ctrl stream.  server will reply with
        // updatecmd, which will invoke a handler to update the cmd object,
        // which will invoke $(cmd).trigger('wasupdated'), which will invoke
        // the handler that updates the view for viewmode (<div
        // class=tab_view>).
        $('form', $editm).submit(function (e) {
            e.preventDefault();
            var o = $(this).serializeObject();
            // cast numeric inputs to JS ints
            $.each(o, function (key, val) {
                if (/^\d+$/.test(val)) {
                    o[key] = parseInt(val);
                }
            });
            var $args = $(this).find('input[name^=arg]');
            var args = $.map($args, attrgetter('value'));
            args = removeFalse(args);
            o.args = args;
            // set command name to argv
            o.name = o.cmd;
            for (var i = 0; i < args.length; i++) {
                o.name += ' ' + args[i];
            }
            o.userdata = $(this).data();
            o.userdata.autostart = this.autostart.checked;
            o.userdata.autoarchive = this.autoarchive.checked;
            cmd.update(o);
            switchToViewTab($widget);
        });
        $(cmd).on('wasupdated', function () {
            $('[name=cmd]', $editm).val(this.cmd);
            this.args.forEach(function (arg, idx) {
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
        $(cmd).on('wasupdated', function () {
            // clean out help div
            $help.empty();
            var action = help(this);
            if (action) {
                action(this, $help, curry(switchToViewTab, $widget), ctrl);
            } else {
                // todo: hide help tab?
            }
        });
    };

    var initTabsNav = function (cmd, $widget) {
        var navlinks = $widget.find('.tab-pane').map(function () {
            var tabname = $(this).data('tabname');
            // give every tab an ID
            this.id = cmd.htmlid + '_tab_' + tabname;
            var $a = $('<a>')
                .text(tabname)
                .prop('href', '#' + this.id)
                .click(function (e) {
                    e.preventDefault();
                    // play nice, don't close
                    // no idea if this actually matters but i like the idea
                    $(this).closest('.cmdwidget').data('activetab', $(this).text());
                });
            return $('<li>').append($a)[0];
        });
        $widget.find('.tabsnav').append(navlinks);
        $widget.tabs({
            activate: function (e, ui) {
                jsPlumb.repaint($(e.target));
            },
        });
    };

    var initCloseButton = function (cmd, $widget) {
        $widget.find('.close').one('click', function () {
            // TODO: are you sure? Y/N
            cmd.release();
            $(this).prop('disabled', true);
        });
    };

    // Init the command view (the V in MVC) given the model (the cmd).
    var initView = function (cmd, $widget) {
        initViewTab(cmd, $widget);
        initEditTab(cmd, $widget);
        initHelpTab(cmd, $widget);
        initTabsNav(cmd, $widget);
        initCloseButton(cmd, $widget);
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

    // update the state of archival on this command.
    var setCommandArchivalState = function (cmd, state) {
        cmd.update({userdata: {archived: state}});
    }

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
    // Hooks view updaters to a custom jQuery event 'wasupdated'. I.e. after
    // changing the cmd run $(cmd).trigger('wasupdated') to update the UI.
    var createCmdWidget = function (cmd) {
        // Fresh command widget in view mode
        var $widget = $('#cmdwidget_template')
            .clone()
            .attr("id", cmd.htmlid)
            .data('activetab', "view");
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
        $(cmd).on('archival', function (_, archived) {
            // if this is a group root, archive the entire group. no need for
            // a conditional; if it's not this jquery selector is empty and
            // thus the entire thing is a NOP.
            var $group = $('#group' + cmd.nid);
            if (archived) {
                hideCmd(this);
                $group.addClass('archived');
            } else {
                showCmd(this);
                $group.removeClass('archived');
            }
        });
        $(cmd).on('wasupdated', function (_, updata) {
            // only archive group leaders
            if (this.userdata.autoarchive &&
                updata.status == 2 &&
                this.isRoot() &&
                // only god archives a command, the rest will follow indirectly
                this.userdata.god == moi)
            {
                setCommandArchivalState(this, true);
            }
            updatePipes(this);
        });
        $(cmd).on('wasreleased', function () {
            [cmd.stdinep, cmd.stdoutep, cmd.stderrep]
                .forEach(jsPlumb.deleteEndpoint);
            // TODO: delete streampeekers
            $widget.remove();
        });
        return $widget;
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

    // build a <li> for the groups list for this command
    var createGroupsLi = function (cmd) {
        // TODO: this is not a good id(ea)
        var $li = $('<li id=group' + cmd.nid + '><span class=name></span></li>')
            .data('gid', cmd.nid);
        if (cmd.isRoot()) {
            $li.find('.name').text(cmd.nid + ': ' + groupname(cmd));
        } else {
            $li.addClass('child');
        }
        $(cmd).on('wasupdated', function (_, updata) {
            // if my name changes, so does the name of my group
            if (updata.name !== undefined) {
                // Set the text of this li to the name of whatever group I
                // belong to
                var gid = this.getGroupId();
                $('#group' + gid + ' .name')
                    .text(gid + ': ' + groupname(cmds[gid]));
            }
            if (updata.userdata && updata.userdata.archived) {
                $li.addClass('archived');
            }
        });
        $(cmd).on('parentAdded', function () {
            // I am now a child, hide my li
            $('#group' + this.nid).addClass('child');
        });
        $(cmd).on('parentRemoved', function () {
            // I'm back!
            $('#group' + this.nid).removeClass('child');
        });
        $(cmd).on('wasreleased', function () {
            $('#group' + this.nid).remove();
        });
        $li.append($('<button>').click(function (e) {
            e.preventDefault();
            // dont close, allows the vm to coalesce these handlers. I
            // actually don't know if js vms do this but it seems logical,
            // since it's not a closure.. given all the fuss about v8 I'd
            // expect at least that compiler to recognize this.
            // surprisingly enough this is not easy to google.
            var $li = $(this).closest('li');
            var cmd = cmds[$li.data('gid')];
            var currentState = $li.hasClass('archived');
            setCommandArchivalState(cmd, !currentState);
        }));
        return $li;
    };

    // build the <div id=groups>
    var buildGroupsList = function () {
        // make a $li for every command, hide it if it's not root
        var lis = $.map(cmds, createGroupsLi);
        return $('#groups ul').append(lis);
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
        return term.termPrintln(data, finalize);
    };

    // ask the server to create a new command. if second argument is passed, it
    // is called with the new command as the argument once the server responds
    var processCmd = function (options, callback) {
        if (options.cmd == "cd") {
            chdir(options.args[0]);
        } else {
            // ensure userdata is an object (rest of the code depends on this)
            if (!$.isPlainObject(options.userdata)) {
                options.userdata = {};
            }
            options.userdata.god = moi;
            if (callback !== undefined) {
                // subscribe to the "newcmdcallback" event in a unique
                // namespace. every new command will trigger the
                // "newcmdcallback" event (without namespace), which will
                // trigger all callbacks, including this one.
                var cbid = 'newcmdcallback.' + guid();
                options.userdata.callback = cbid;
                $(window).on(cbid, function (_, cmd) {
                    // namespaced jquery event, can be triggered spuriously.
                    // make sure that this command corresponds to this
                    // callback.
                    if (cmd.userdata.callback == cbid) {
                        callback(cmd);
                    }
                });
                // clear the callback after ten seconds. this means that the
                // server has ten seconds to generate a newcmd event, which
                // will trigger the newcmdcallback event. after that, the
                // callback is silently deleted. this is not great because the
                // callback has no way of knowing whether it timed out or not.
                setTimeout(function () {
                    $(window).off(cbid);
                }, 10000);
            }
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
        $.each(cmds_init, function (_, cmdinit) {
            var cmd = new Command(ctrl, cmdinit);
            cmds[cmdinit.nid] = cmd;
        });
        $.each(cmds, function (_, cmd) { createCmdWidget(cmd); });
        // second iteration to ensure all widgets exist before connecting them
        $.each(cmds, function (_, cmd) { updatePipes(cmd); });
        buildGroupsList();
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
            var cmdinit = JSON.parse(cmdjson);
            var cmd = new Command(ctrl, cmdinit);
            cmds[cmd.nid] = cmd;
            createCmdWidget(cmd);
            delete cmdinit.nid;
            $('#groups ul').append(createGroupsLi(cmd));
            cmd.update(cmdinit);
            if (cmd.userdata.god == moi) {
                // i made this!
                // capture all stdout and stderr to terminal
                var printer = function (_, data) {
                    termPrintlnCmd(term, cmd.nid, data);
                };
                // TODO: should only print when not piped to other cmd
                $(cmd).on('stdout.stream', printer);
                $(cmd).on('stderr.stream', printer);
                // subscribe to stream data
                ctrl.send('subscribe', cmd.nid, 'stdout');
                ctrl.send('subscribe', cmd.nid, 'stderr');
                var $widget = $('#' + cmd.htmlid);
                if (cmd.userdata.autostart) {
                    cmd.start();
                } else {
                    // If not autostarting, go directly into edit mode
                    $widget.tabs('option', 'active', 1);
                }
                // trigger all callbacks waiting for a newcmd event
                $(window).trigger('newcmdcallback', cmd);
            }
        });
        // command has been updated
        $(ctrl).on("updatecmd", function (_, updatajson) {
            var updata = JSON.parse(updatajson);
            var cmd = cmds[updata.nid];
            cmd.processUpdate(updata);
        });
        $(ctrl).on("cmd_released", function (_, idstr) {
            var nid = +idstr;
            var cmd = cmds[nid];
            cmd.processRelease();
            delete cmds[nid];
        });
        path($('form#path'), ctrl);
        term = terminal(processCmd);
        if (window.location.hash) {
            processHash(window.location.hash.slice(1));
        }
        // proxy the stream event to the command object
        // comes in as: stream;1;stdout;foo bar
        // the normal event handling causes the 'stream' event to trigger
        // that's this one. this handler will proxy that event to the command
        // object's processStream method.
        $(ctrl).on('stream', function (_, rawopts) {
            var opts = rawopts.splitn(';', 3);
            var sysid = opts[0];
            var stream = opts[1];
            var data = opts[2];
            cmds[sysid].processStream(stream, data);
        });
        // now that all widgets have been built (and most importantly: update
        // handlers have been set) populate the cmd objects to init the widgets
        $.each(cmds_init, function (nid, cmdinit) {
            cmds[nid].processUpdate(cmdinit);
        });
    });

});
