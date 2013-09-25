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


// The View for command objects.
//
// Every command widget is wrapped in a group widget. Within that group widget resides:
//
// - the command widget
// - helper nodes inserted by jsPlumb
// - the group widget of every child of the command
//
// eg "echo hahahajustkidding | tee /tmp/foo | mail -s 'I think you are great' root"
//
// cmd ids: echo=1, tee=2, mail3
//
// then this is your view tree:
//
// (groupwidget1
//   (cmdwidget1)
//   (jsPlumbstuff)
//   (morejsPlumbstuff)
//   (children
//     (groupwidget2
//       (cmdwidget2)
//       .... // jsplumb stuff
//       (children
//         (groupwidget3
//           (cmdwidget3)
//           ... // jsPlumb stuff
//           )))))

define(["jquery",
        'lush/help',
        'jsPlumb',
        "lush/utils"],
       function ($, help) {
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
    var makeStopButton = function (cmd) {
        return $('<button class=stop>◼</button>').click(function (e) {
            e.preventDefault();
            $(e.target).html('⌚');
            $(e.target).prop('disabled', true);
            cmd.stop();
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

    // Stream peeker is like a small dumb terminal window showing a stream's most
    // recent output
    var addstreampeeker = function (srcep, ctrl) {
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
            .appendTo('#group' + cmdSysId);
        // Closure that fills the stream peeker with stdout data every second
        // until it is closed
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
        syncPositionWithServer($sp[0], ctrl, jsPlumb.repaint);
        jsPlumb.draggable($sp[0], {
            stop: function () { storePositionOnServer(this, ctrl); },
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

    var createStreamPeekerWhenDblClicked = function (ep, ctrl) {
        return $(ep.canvas)
            .css('z-index', 4) // put endpoint above the connector (is at 3)
            .one('dblclick', function() {
                addstreampeeker(ep, ctrl);
            });
    };

    // hide all visuals related to this command
    var hideCmd = function (cmd) {
        $('#group' + cmd.nid).css('display', 'none');
    };

    var showCmd = function (cmd) {
        $('#group' + cmd.nid).css('display', 'none');
    };

    // create widget with command info and add it to the DOM.
    //
    // jsPlumb endpoints: widgets have three endpoints: stdin, stdout and
    // stderr. these endoints are jsPlumb.Endpoint objects and their reference
    // is needed to connect them to eachother. this function creates the
    // endpoints and stores their reference in the cmd argument object as
    // .stdinep, .stdoutep and .stderrep.
    //
    // Hooks view updaters to a custom jQuery event 'wasupdated'. I.e. after
    // changing the cmd run $(cmd).trigger('wasupdated') to update the UI.
    // (This is done automatically if you update the command through its
    // .update() method)
    var Widget = function (cmd, ctrl) {
        if (cmd === undefined || ctrl === undefined) {
            throw "missing argument(s) to Widget constructor";
        }
        var widget = this;
        // Fresh command widget in view mode
        this.groupnode = $('#groupwidget_template')
            .clone()
            .attr("id", "group" + cmd.nid)[0];
        this.node = $(this.groupnode).find('.cmdwidget')
            .attr("id", cmd.htmlid)
            .data('activetab', "view")[0];
        this.cmd = cmd;
        this._initView(cmd);
        this._insertInDOM();
        this._initJsPlumb(ctrl);
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
        $(cmd).on('wasreleased', function () {
            $(widget.node).remove();
            delete widget.groupnode;
            delete widget.node;
            delete widget.cmd;
        });
    };

    Widget.prototype._initJsPlumb = function (ctrl) {
        var cmd = this.cmd;
        $(this.node).on('tabsactivate', function () {
            jsPlumb.repaint($(this));
        });
        syncPositionWithServer(this.node, ctrl, function (node) {
            jsPlumb.repaint($(node));
        });
        jsPlumb.draggable(this.node, {
            stop: function () { storePositionOnServer(this, ctrl); },
        });
        $(this.node).resizable({
            resize: function () {
                jsPlumb.repaint($(this));
            }
        });
        cmd.stdinep = jsPlumb.addEndpoint(this.node, {
            anchor: 'TopCenter',
            isTarget: true,
            parameters: {
                sysid: constantly(cmd.nid),
            },
        });
        cmd.stdoutep = jsPlumb.addEndpoint(this.node, {
            anchor: 'BottomCenter',
            isSource: true,
            parameters: {
                stream: constantly("stdout"),
                sysid: constantly(cmd.nid),
            },
        });
        cmd.stderrep = jsPlumb.addEndpoint(this.node, {
            anchor: 'RightMiddle',
            isSource: true,
            parameters: {
                stream: constantly("stderr"),
                sysid: constantly(cmd.nid),
            },
        });
        // Doubleclicking a source endpoint creates a streampeeker
        createStreamPeekerWhenDblClicked(cmd.stdoutep, ctrl);
        createStreamPeekerWhenDblClicked(cmd.stderrep, ctrl);
        $(cmd).on('childAdded', function (_, child, stream) {
            var ep = (stream == 'stdout') ? this.stdoutep : this.stderrep;
            connectVisually(ep, child.stdinep, stream);
        });
        $(cmd).on('childRemoved', function (_, child, stream) {
            // TODO
            //throw "disconnecting streams not implemented in UI";
        });
        $(cmd).on('wasreleased', function () {
            [this.stdinep, this.stdoutep, this.stderrep]
                .forEach(jsPlumb.deleteEndpoint);
            // TODO: delete streampeekers
        });
    };

    Widget.prototype._switchToViewTab = function () {
        // view is always first. hack? who cares.
        $(this.node).tabs('option', 'active', 0);
    };

    Widget.prototype._initViewTab = function () {
        var $viewm = $(this.node).find('.tab_view');
        // static parts of the UI (depend on constant cmd property "nid")
        $viewm.find('.link').attr('href', '/' + this.cmd.nid + '/')
              .find('.linktext').text(this.cmd.nid + ': ');
        // when clicked will prepare this command for repeating (argv ->
        // prompt, focus prompt)
        var cmd = this.cmd;
        $viewm.find('.repeat').click(function (e) {
            e.preventDefault();
            term.set_command(cmd.getArgv().join(' ')).focus();
        });
        // dynamic parts of the UI
        $(this.cmd).on('wasupdated', function () {
            setStatNode(this, $('.status', $viewm));
            var argvtxt = this.getArgv().join(' ');
            $viewm.find('.argv').text(argvtxt);
            $viewm.find('.bookmark').attr('href', '#prompt;' + argvtxt);
        });
    };

    Widget.prototype._initEditTab = function () {
        var widget = this;
        var $editm = $(this.node).find('.tab_edit');
        $editm.find('[name=cmd]').autocomplete({source: "/new/names.json"});
        var lastarg = 1;
        var addarg = function () {
            $('[name=arg' + lastarg + ']', $editm).after(
                $('<input size=10 name=arg' + (++lastarg) + '>')
                    .one('keydown', addarg));
        };
        $editm.find('[name=arg1]').one('keydown', addarg);
        // request the command to be updated. behind the scenes this happens:
        // send "updatecmd" message over ctrl stream.  server will reply with
        // updatecmd, which will invoke a handler to update the cmd object,
        // which will invoke $(cmd).trigger('wasupdated'), which will invoke
        // the handler that updates the view for viewmode (<div
        // class=tab_view>).
        $editm.find('form').submit(function (e) {
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
            widget.cmd.update(o);
            widget._switchToViewTab();
        });
        var setFormContents = function ($editm, cmd) {
            $editm.find('[name=cmd]').val(cmd.cmd);
            cmd.args.forEach(function (arg, idx) {
                // keydown triggers the "create new arg input" handler
                $editm.find('[name=arg' + (idx + 1) + ']').val(arg).keydown();
            });
            $editm.find('[name=stdoutScrollback]').val(cmd.stdoutScrollback)
            $editm.find('[name=stderrScrollback]').val(cmd.stderrScrollback)
            $editm.find('[name=autostart]')[0].checked = cmd.userdata.autostart;
            $editm.find('[name=autoarchive]')[0].checked = cmd.userdata.autoarchive;
        };
        $(this.cmd).on('wasupdated', function () {
            setFormContents($editm, this);
        });
        $editm.find('.cancelbtn').click(function () {
            setFormContents($(this).closest('.tab_edit'), cmd);
            widget._switchToViewTab();
        });
    };

    // initialize a widget's help view
    Widget.prototype._initHelpTab = function () {
        var widget = this;
        $(this.cmd).on('wasupdated', function () {
            var $help = $('#' + this.htmlid + ' .tab_help');
            // clean out help div
            $help.empty();
            var action = help(this);
            if (action) {
                action(this, $help, function () { widget._switchToViewTab(); });
            } else {
                // todo: hide help tab?
            }
        });
    };

    Widget.prototype._initTabsNav = function () {
        var cmd = this.cmd;
        var navlinks = $(this.node).find('.tab-pane').map(function () {
            var tabname = $(this).data('tabname');
            // give every tab an ID (necessary for jquery.ui)
            this.id = cmd.htmlid + '_tab_' + tabname;
            var $a = $('<a>')
                .text(tabname)
                .prop('href', '#' + this.id)
                .click(function (e) {
                    e.preventDefault();
                    $(this).closest('.cmdwidget').data('activetab', $(this).text());
                });
            return $('<li>').append($a)[0];
        });
        $(this.node).find('.tabsnav').append(navlinks);
        $(this.node).tabs({
            activate: function (e, ui) {
                jsPlumb.repaint(this);
            },
        });
    };

    Widget.prototype._initCloseButton = function () {
        var cmd = this.cmd;
        $(this.node).find('.close').one('click', function (e) {
            e.preventDefault();
            // TODO: are you sure? Y/N
            cmd.release();
            $(this).prop('disabled', true);
        });
    };

    // Init the different tabs and further lay-out
    Widget.prototype._initView = function () {
        this._initViewTab();
        this._initEditTab();
        this._initHelpTab();
        this._initTabsNav();
        this._initCloseButton();
    };

    Widget.prototype._insertInDOM = function () {
        $('#cmds').append(this.groupnode);
    };

    return Widget;

});
