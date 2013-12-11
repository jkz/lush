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


// TERMINAL HANDLING

define(["jquery",
        "lush/Parser2",
        "lush/Pool",
        "lush/utils",
        "jquery.terminal",
        "jquery.ui"],
       function ($, Parser, Pool) {
    // Print text to this terminal. Ensures the text always ends in newline.
    $.fn.termPrintln = function (text, finalize) {
        // term.echo will always append newline so strip one off if exists
        if (hassuffix(text, '\r\n')) {
            text = text.slice(0, -2);
        } else if (hassuffix(text, '\n')) {
            text = text.slice(0, -1);
        }
        text = escapeHTML(text);
        // jquery.terminal interprets square brackets
        text = text.replace(/\[/g, '&#91;');
        return this.echo(text, finalize);
    };

    // prefix all special chars in arg by backslash
    var pescape = function (txt) {
        return txt.replace(/([\\?*\s"'])/g, "\\$1");
    };

    var punescape = function (txt) {
        return txt.replace(/\\(.)/g, "$1");
    };

    var parseerror = function (msg, pos) {
        return {
            pos: pos,
            msg: msg,
        };
    };

    var startsWithDot = function (str) {
        return str[0] == ".";
    }

    // list of files matching a pattern. if showhidden is false this excludes files
    // starting with a dot. if showhidden is not specified this only shows those
    // files if the pattern itself starts with a dot.
    var glob = function (pattern, showhidden) {
        var files = [];
        $.ajax('/files.json', {
            data: {pattern: pattern},
            success: function (x) {
                files = x;
            },
            async: false});
        if (showhidden === undefined) {
            showhidden = startsWithDot(pattern);
        }
        if (!showhidden) {
            // hide files starting with a dot
            files = $.grep(files, startsWithDot, true);
        }
        return files;
    };

    // send what is currently on the prompt to the terminal output
    var echoInput = function (term) {
        return term.termPrintln(term.get_prompt() + term.get_command());
    };

    // Called with array of filenames to populate a partially completed command
    // line word as a file. The "partial" argument is the snippet the user is
    // trying to tab complete
    var tabcompleteCallback = function (term, parser, partial, files) {
        files = $.map(files, pescape);
        if (files.length == 0) {
            return;
        }
        if (files.length == 1) {
            term.insert(files[0].slice(partial.length) + " ");
            return;
        }
        var pref = lcp(files);
        if (pref.length > partial.length) {
            // all possible completions share a prefix longer than current partial
            term.insert(pref.slice(partial.length));
            return;
        }
        echoInput(term);
        $.each(files, function (_, x) { term.termPrintln(x); });
    };

    // manage context of a command line interface. purely conceptual, no UI.
    // processCmd arg is a function, called by the cli to actually invoke a
    // command (after parsing etc).
    var Cli = function (processCmd) {
        var cli = this;
        // Locally identify this specific command line
        cli.guid = guid();
        // cmds in live sync mode
        cli._sync = { };
        cli._processCmd = processCmd;
        // Prepared commands pool for quicker turn-around after hitting enter
        cli._cmdpool = new Pool();
        // Pre-fetch five commands for the pool
        cli._prefetchCmd();
        cli._prefetchCmd();
        cli._prefetchCmd();
        cli._prefetchCmd();
        cli._prefetchCmd();
    };

    Cli.prototype._initParser = function () {
        var cli = this;
        cli._parserctx = {};
        var ctx = cli._parserctx; // shorthand
        ctx.parser = new Parser();
        var newAst = function () {
            return {
                // updated after each call to setprompt()
                argv: [],
                // building the next argument
                _newarg: '',
                // true when _newarg contains a globbing char
                _hasglob: false,
            };
        };
        ctx.parser.oninit = function () {
            ctx.ast = newAst();
        };
        ctx.parser.onliteral = function (c) {
            // internal representation is escaped
            ctx.ast._newarg += pescape(c);
        };
        ctx.parser.onglobQuestionmark = function () {
            ctx.ast._hasglob = true;
            ctx.ast._newarg += '?';
        };
        ctx.parser.onglobStar = function () {
            ctx.ast._hasglob = true;
            ctx.ast._newarg += '*';
        };
        ctx.parser.onboundary = function () {
            if (ctx.ast._hasglob) {
                var matches = glob(ctx.ast._newarg);
                // TODO: error if matches is empty
                ctx.ast.argv.push.apply(ctx.ast.argv, matches);
            } else {
                // undo internal escape representation
                ctx.ast.argv.push(punescape(ctx.ast._newarg));
            }
            ctx.ast._newarg = '';
        };
        ctx.parser.onpipe1 = function () {
            var outast = newAst();
            var curast = ctx.ast;
            ctx.parser.onpipe1 = function () {
                // haha
                throw "chaining multiple commands not supported yet!";
            };
            var old2handler 
            ctx.parser.onpipe2 = function () {
                asdf
            ctx.ast.stdout = outcmd;
            ctx.ast = outcmd;
        }
    }

    function assertLegalType(type) {
        switch (type) {
        case "stderr":
        case "stdout":
        case "main":
            return;
        }
        throw "invalid command type: " + type;
    }

    Cli.prototype._prefetchCmd = function () {
        var cli = this;
        var options = {
            userdata: {
                // set to false once command is taken out of pool
                unused: true,
                // set to false once command starts being used
                archived: true,
                creator: "prompt",
            }
        };
        cli._processCmd(options, function (cmd) {
            cli._cmdpool.add(cmd);
        });
    };

    function isTree(t) {
        return t === undefined || $.isFunction(t.left) && $.isFunction(t.right);
    }

    function allTrue(ar) {
        var and = function (x, y) { return x && y; };
        return ar.reduce(and, true);
    }

    function attrgetter(name) {
        return function (x) { return x[name]; };
    }

    function mapTree(f, tree) {
        if (!$.isFunction(f)) {
            throw "first argument to mapTree must be a function";
        }
        if (!isTree(tree)) {
            throw "non-tree second argument passed to mapTree";
        }
        if (tree === undefined) {
            return;
        }
        f(tree);
        mapTree(f, tree.left());
        mapTree(f, tree.right());
    }

    function Node(cmd, ast, _dad, _stream) {
        if (cmd !== undefined && !(cmd instanceof Command) {
            throw "cmd param must be a Command object";
        }
        if (_dad !== undefined && !(_dad instanceof Node) {
            throw "_dad param must be a Node object";
        }
        if (cmd === undefined && ast === undefined) {
            return undefined;
        }
        this.ast = ast;
        this.cmd = cmd;
        this.dad = _dad;
        this.stream = _stream;
    }

    Node.prototype.left = function () {
        return new Node(cmd.stdoutto, ast, cmd, 'stdout');
    };

    Node.prototype.right = function () {
        return new Node(cmd.stderrto, ast, cmd, 'stderr'); },
    };

    function parseast2tree(ast) {
        return {
            ast: ast,
            left: ast.stdout,
            right: ast.stderr,
        };
    }

    function compareNodes(astnode, cmdnode) {
        if (astnode === undefined && cmdnode === undefined) {
            throw "at least one node must be defined";
        } else if (astnode === undefined) {
            // used to be prepared, is not anymore
            cmd.release();
        } else if (cmdnode === undefined) {

    // propagate changes in the prompt to the given cmd tree.
    // continuation passed as third arg will be called with a new cmd object for
    // this ast, or undefined if N/A.
    //
    // this method is so messed up..
    Cli.prototype._syncPrompt = function (ast, cmd, passCmdWhenDone) {
        var cli = this;
        if (!$.isFunction(passCmdWhenDone)) {
            throw "_syncPrompt requires continuation as third param";
        }
        if (cmd === undefined && ast === undefined) {
            // perfect! don't touch anything.
            passCmdWhenDone(undefined);
            return;
        } else if (cmd === undefined) {
            // no command object associated with this level yet. request a new
            // one and retry
            cli.pool.consume(function (cmd) {
                cli._syncPrompt(ast, cmd, passCmdWhenDone);
            });
            return;
        } else if (ast === undefined) {
            // there used to be some tree structure in the command that was
            // typed, so command(s) (this one, and transitively its children)
            // were allocated to reflect that. the user changed his mind and
            // removed that part of the tree. many things can be done with the
            // pre-allocated but now-unnecessary command objects, but by far the
            // easiest is to just ditch them all. this is easy to understand for
            // the user, easy to program and wasteful of resources (there is
            // probably a choose-2 joke there).
            function Node(cmd) {
                this.cmd = cmd;
            }
            Node.prototype.left = function () {
                var cmd = this.cmd.stdoutCmd();
                if (cmd !=== undefined) {
                    return new Node(cmd);
                }
            };
            Node.prototype.right = function () {
                var cmd = this.cmd.stderrCmd();
                if (cmd !=== undefined) {
                    return new Node(cmd);
                }
            };
            mapTree(function (n) { n.cmd.release(); }, new Node(cmd));
            // inform caller that his child died.
            passCmdWhenDone(undefined, "so sorry for your loss.");
            // pray to the GC gods
            return;
        } else {
            // update an existing synced command object
            if (!$.isArray(ast.argv) || !ast.hasOwnProperty("txt")) {
                throw "Illegal ast node, expected argv and txt keys";
            }
            cmd.update({
                cmd: ast.argv[0],
                args: ast.argv.slice(1),
                name: ast.txt,
            }, cli.guid)
            // continue to the children
            cmd._syncPrompt(ast.stdout, cmd.stdoutCmd(), function (outChild) {
                // outChild is a new child for stdoutto
                if (outChild === undefined) {
                    cmd.update({stoudtto: 0});
                } else {
                    cmd.update({stdoutto: outChild.nid});
                }
            });
            cmd._syncPrompt(ast.stderr, cmd.stderrCmd(), function (errChild) {
                // errChild is a new child for stderrto
                if (errChild === undefined) {
                    cmd.update({stoudtto: 0});
                } else {
                    cmd.update({stderrto: errChild.nid});
                }
            });
            passCmdWhenDone(cmd);
            return;
        }
        throw "hraban done messed up";
    };

    // the user updated the prompt: call this method to notify the cli object
    Cli.prototype.setprompt = function (txt) {
        var cli = this;
        if (txt == cli._rawtxt) {
            // nothing changed; ignore
            return;
        }
        cli._rawtxt = txt;
        if (cli._cmd === undefined) {
            cli._prepareCmdForSync();
        } else if (cli._cmd !== null) {
            if (cli._cmd.userdata.unused) {
                // only mark as used once the user actually types something in
                // the prompt. don't worry about race conditions: as long as
                // this session is in the server's allclients set this command
                // won't be pruned.
                var updata = {
                    userdata: {
                        unused: false,
                        archived: false,
                    }
                };
                cli._cmd.update(updata);
            }
            cli.parser.parse(txt);
            cli._cmd.update({
                name: txt,
                cmd: cli.argv[0],
                args: cli.argv.slice(1),
            }, cli.guid);
        }
    };

    // try to report an error to the user
    Cli.prototype._error = function (errmsg) {
        var cli = this;
        if (cli.onerror) {
            cli.onerror(errmsg);
        } else {
            console.log("Terminal error: " + errmsg);
        }
    };

    // commit the current prompt ([enter] button)
    Cli.prototype.commit = function (txt) {
        var cli = this;
        if (!cli._cmd) {
            throw "cmd not ready";
        }
        var cmd = cli._cmd;
        cli._cmd = undefined;
        cli._prepareCmdForSync();
        // need to re-parse because jQuery terminal triggers the "clear command
        // line" event on [enter] before the "handle command" event.
        cli.parser.parse(txt);
        if (cli.argv.length == 0) {
            return;
        }
        cmd.update({
            name: txt,
            cmd: cli.argv[0],
            args: cli.argv.slice(1),
            userdata: {
                autoarchive: true,
                starter: cli.guid,
            }
        }, cli.guid);
        cmd.start();
    }

    // connect this part of the prompt tree with a command.
    //
    // the point here is to take a fresh command (from the pool, but that is
    // irrelevant for this logic) and "connect" it to a certain part of the
    // command tree being typed in at the prompt.
    //
    // e.g.: cat /etc/hosts | grep -F 127.0.0.1
    //
    // this represents a tree with one root (cat) and one leaf node (grep,
    // tagged stdout):
    //
    // PATH     CMD
    // /        cat
    // /stdout  grep
    //
    // _prepareCmdForSync is called twice:
    //
    // cli._prepareCmdForSync('/')
    // cli._prepareCmdForSync('/stdout')
    //
    Cli.prototype._prepareCmdForSync = function (path) {
        var cli = this;
        assertLegalPath(path);
        var cmd = cli._sync[path];
        if (cmd === null) {
            throw 'command "' + path + '" is already being prepared for cli';
        } else if (cmd !== undefined) {
            throw 'there is already a command associated with "' + path + '"';
        }
        cli._sync[path] = null; // ok I'm working on this!
        cli._cmdpool.consume(function (cmd) {
            cli._sync[path] = cmd;
            // when /any/
            $(cmd).on('updated.status.terminal', function (e) {
                var cmd = this;
                // if currently bound command is started
                if (cmd.status.code > 0) {
                    // once started, every terminal event handler is useless
                    $(cmd).off('.terminal');
                    // if it was started externally
                    if (cmd.userdata.starter != cli.guid &&
                        cli._sync[path] == cmd)
                    {
                        // unbind me from the cli
                        cli._cmd = undefined;
                        // prepare a new one
                        cli._prepareCmdForSync();
                    }
                }
            });
            $(cli).trigger('prepared', [cmd, path]);
        });
        // put a new one in the pool
        cli._prefetchCmd();
    };

    // set up the terminal window
    return function (processCmd) {
        var cli = new Cli(processCmd);
        var $term = $('.terminal').terminal(function (x) {
                cli.commit(x);
            }, {
            greetings: 'Welcome to Luyat shell',
            name: 'lush',
            prompt: '$ ',
            tabcompletion: true,
            onCommandChange: function (txt) {
                try {
                    cli.setprompt(txt);
                } catch (e) {
                    // ignore errors while typing command
                }
            },
            // completion for files only (broken)
            completion: function (term) {
                var argv = parser.parse(term.get_command());
                if (!$.isArray(argv)) {
                    // parse error
                    return;
                }
                if (argv.length < 2) {
                    // only works on filenames
                    return;
                }
                var partial = argv.pop().text;
                var pattern = punescape(partial) + "*";
                // home grown callback function
                var callback = curry(tabcompleteCallback, term, parser, partial);
                $.get('/files.json', {pattern: pattern}, callback);
            },
        });
        cli.onerror = $term.error;
        // a cmd object (and widget) has been prepared for this cli
        $(cli).on('prepared', function (_, cmd) {
            // when the associated command (args or cmd) is updated from outside
            $(cmd).on('updated.args.cmd.terminal', function (e, by) {
                var cmd = this;
                if (by == cli.guid || by == 'init') {
                    // ignore init, empty updates and updates from myself
                    return;
                }
                var txt = $.map(cmd.getArgv(), pescape).join(' ');
                // hack to prevent the onCommandChange handler from sending this
                // change back to the command object. justified because the real
                // solution is a better jQuery.terminal API imo.
                var tempcli = cli;
                cli = undefined;
                $term.set_command(txt);
                cli = tempcli;
            });
        });
        return $term;
    };
});
