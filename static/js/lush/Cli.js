// Copyright © 2013, 2014 Hraban Luyat <hraban@0brg.net>
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


// Model for the command line interface. Conventions in this file:
//
// - all updates to a command object MUST specify the GUID of the CLI as the by
// parameter.
//
// - all (jQuery) event handlers hooked to a command object MUST be specified in
// the .terminal namespace.

"use strict";

define(["jquery", "lush/Command", "lush/Parser2", "lush/Pool", "lush/utils"],
       function ($, Command, Parser, Pool) {

    // prefix all special chars in arg by backslash
    function pescape(txt) {
        return txt.replace(/([\\?*\s"'])/g, "\\$1");
    }

    function punescape(txt) {
        return txt.replace(/\\(.)/g, "$1");
    }

    function startsWithDot(str) {
        return str[0] == ".";
    }

    // list of files matching a pattern. if showhidden is false this excludes files
    // starting with a dot. if showhidden is not specified this only shows those
    // files if the pattern itself starts with a dot.
    function glob(pattern, showhidden) {
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
    }

    // Manage context of a command line interface. purely conceptual, no UI.
    // processCmd arg is a function, called by the cli to actually invoke a
    // command (after parsing etc).
    //
    // Requires a function to be tacked on before use: .onUpdatedPrompt. Will be
    // called with a string as the argument every time a command is changed from
    // the outside. The argument is the new command prompt.
    //
    // requires ANOTHER function to be tacked on: .onerror. is passed an error
    // string as the first argument whenever one arises.
    //
    // This model is constantly updated by a terminal with the latest user input
    // (the prompt), live as the user types. The cli model will parse the
    // prompt, live, and allocate command objects as necessary. These command
    // objects are synchronized with the prompt: if the prompt changes, the
    // command objects are updated (by the cli model). If any of the command
    // objects change, the onUpdatedPrompt function is called with the new
    // prompt string.
    //
    // why not jQuery events? because this is simpler, and because it causes an
    // error if caller forgets to set the callbacks.
    var Cli = function (processCmd) {
        var cli = this;
        // Locally identify this specific command line
        cli._guid = guid();
        cli._processCmd = processCmd;
        cli._initParser();
        // Prepared commands pool for quicker turn-around after hitting enter
        cli._cmdpool = new Pool();
        // Pre-fetch five commands for the pool
        cli._prefetchCmd();
        cli._prefetchCmd();
        cli._prefetchCmd();
        cli._prefetchCmd();
        cli._prefetchCmd();
        // a Deferred that resolves when the command tree is synced with the
        // latest call to setprompt()
        cli._syncingPrompt = $.Deferred().resolve();
    };

    // An Ast node represents the (rich) argv of one command. the complete
    // command line consists of one or more commands chained by pipes. it is
    // represented as a linked list of AST nodes.
    function Ast() {
        var ast = this;
        // updated after each call to setprompt()
        ast.argv = [];
        // building the next argument
        ast._newarg = '';
        // true when _newarg contains a globbing char
        ast.hasglob = false;
        // pointer to next command, if any
        ast.stdout = undefined;
    }

    Ast.prototype.getName = function () {
        var ast = this;
        return ast.argv.join(' ');
    };

    Cli.prototype._initParser = function () {
        var cli = this;
        // context for the parser
        cli._parserctx = {
            parser: new Parser(),
            // the first parsed command, head of the linked list. pointer to the
            // next is in the "stdout" member of the ast node.
            firstast: undefined,
            // The command currently being parsed
            ast: undefined,
            ignoreErrors: false,
        };
        var ctx = cli._parserctx; // shorthand
        ctx.parser.oninit = function () {
            ctx.firstast = ctx.ast = new Ast();
        };
        ctx.parser.onliteral = function (c) {
            // internal representation is escaped
            ctx.ast._newarg += pescape(c);
        };
        ctx.parser.onglobQuestionmark = function () {
            ctx.ast.hasglob = true;
            ctx.ast._newarg += '?';
        };
        ctx.parser.onglobStar = function () {
            ctx.ast.hasglob = true;
            ctx.ast._newarg += '*';
        };
        ctx.parser.onboundary = function () {
            if (ctx.ast.hasglob) {
                var matches = glob(ctx.ast._newarg);
                // TODO: error if matches is empty
                ctx.ast.argv.push.apply(ctx.ast.argv, matches);
            } else {
                // undo internal escape representation
                ctx.ast.argv.push(punescape(ctx.ast._newarg));
            }
            ctx.ast._newarg = '';
        };
        // encountered a | character
        ctx.parser.onpipe = function () {
            // this is a fresh command
            var newast = new Ast();
            // which is the child of the previously parsed cmd
            ctx.ast.stdout = newast;
            // haiku
            ctx.ast = newast;
        };
        ctx.parser.onerror = function (err, type) {
            if (!ctx.ignoreErrors) {
                throw err;
            }
            switch (err.type) {
            case Parser.errcodes.UNBALANCED_SINGLE_QUOTE:
                // ignore. can only happen at end of input, so finish up:
                ctx.parser.onboundary();
                break;
            case Parser.errcodes.UNBALANCED_DOUBLE_QUOTE:
                // ignore
                ctx.parser.onboundary();
                break;
            case Parser.errcodes.TERMINATING_BACKSLASH:
                // ignore!
                ctx.parser.onboundary();
                break;
            default:
                throw "unknown parser error: " + err;
            }
        };
    };

    Cli.prototype._parse = function (txt, ignoreParseError) {
        var cli = this;
        if (typeof txt !== "string") {
            throw "_parse requires text to parse";
        }
        var ctx = cli._parserctx;
        ctx.parser.parse(txt);
        return ctx.firstast;
    };

    // ask the server for a new command and put it in "CLI mode"
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

    // Ask server for a "CLI mode" command. Returns a Deferred which will be
    // passed the command when it is received. Returns a resolved Deferred if
    // the command pool is populated.
    Cli.prototype._getCmdFromPool = function () {
        var cli = this;
        var def = $.Deferred();
        cli._prefetchCmd();
        cli._cmdpool.consume(function (cmd) {
            cli._prepareCmdForSync(cmd);
            def.resolve(cmd);
        });
        return def;
    };

    // execute f on cmd and all its children
    function mapCmdTree(cmd, f) {
        if (cmd === undefined) {
            return;
        }
        if (!(cmd instanceof Command)) {
            throw "mapCmdTree: cmd must be a Command instance";
        }
        f(cmd);
        mapCmdTree(cmd.stdoutCmd(), f);
    }

    // propagate changes in the prompt to the given cmd tree.
    //
    // returns a Deferred that will be called with a (possibly fresh) cmd object
    // for this ast when the command and its entire subtree has been updated.
    //
    // this method is so messed up..
    //
    // split off to a non-method function to make it very clear that this does
    // not change the CLI object internally; responsibility is really with the
    // caller to handle the resulting command.
    function syncPromptToCmd(ast, cmd, updateGUID, getCmd) {
        // sanity checks
        if (ast !== undefined && !(ast instanceof Ast)) {
            throw "Illegal ast node";
        }
        if (cmd !== undefined && !(cmd instanceof Command)) {
            throw "Illegal command object";
        }
        if (!$.isFunction(getCmd)) {
            throw "syncPromptToCmd needs a callable getCmd parameter";
        }

        if (cmd === undefined && ast === undefined) {
            // perfect! don't touch anything.
            return $.Deferred().resolve(undefined);
        } else if (cmd === undefined) {
            // no command object associated with this level yet. request a new
            // one and retry
            return getCmd().then(function (cmd) {
                return syncPromptToCmd(ast, cmd, updateGUID, getCmd);
            });
        } else if (ast === undefined) {
            // the pipeline used to contain more commands.  the user changed his
            // mind and removed one (or more). many things can be done with the
            // pre-allocated but now-unnecessary command objects, but by far the
            // easiest is to just ditch them all. this is easy to understand for
            // the user, easy to program and wasteful of resources (there is
            // probably a choose-2 joke there).
            //
            // so.
            //
            // clean up the mess once this command is detached from its parent.
            // can't clean up earlier because a child must exist at the moment
            // of detaching.
            $(cmd).one('parentRemoved', function () {
                var cmd = this;
                mapCmdTree(cmd, function (cmd) { cmd.release(); });
            });
            // inform the parent that his child died (hopefully he will
            // disconnect) (otherwise we're in trouble)
            return $.Deferred().resolve(undefined, "so sorry for your loss");
        } else {
            // update an existing synced command object
            // TODO: Can be merged in continuation, only makes sense when
            // setprops ws event exists
            cmd.update({
                cmd: ast.argv[0] || "",
                args: ast.argv.slice(1),
                name: ast.getName(),
                // only mark as used once the user actually types something in
                // the prompt. don't worry about race conditions: as long as
                // this session is in the server's allclients set this command
                // won't be pruned.
                userdata: {
                    unused: false,
                    archived: false,
                }
            }, updateGUID);
            // continue to the children
            return syncPromptToCmd(ast.stdout, cmd.stdoutCmd(), updateGUID, getCmd).then(function (outChild) {
                // the subtree has been synced, update me
                var stdoutto;
                // outChild is a new child for stdoutto
                if (outChild === undefined) {
                    stdoutto = 0;
                } else {
                    stdoutto = outChild.nid;
                }
                var def = $.Deferred();
                cmd.update({stdoutto: stdoutto}, updateGUID, function (cmd) {
                    // I have been synced, let my caller know
                    def.resolve(cmd);
                });
                return def;
            });
        }
        throw "hraban done messed up"; // shouldnt reach
    }

    // Update the synchronized command tree to reflect changes to the prompt.
    // Returns a deferred that is resolved when the command tree is synced with
    // this prompt.
    Cli.prototype._syncPrompt = function (ast) {
        if (!(ast instanceof Ast)) {
            throw "ast argument must be an Ast instance";
        }
        var cli = this;
        var doneDeferred = $.Deferred();
        var getCmd = cli._getCmdFromPool.bind(cli);
        return syncPromptToCmd(ast, cli._cmd, cli._guid, getCmd).then(function (cmd) {
            if (cmd === undefined) {
                // not rejecting the Deferred here because this is a heavy
                // assert()-fail; don't expect anything to work anymore anyway.
                throw "No root command parsed";
            }
            cli._cmd = cmd;
            // do not pass the command to the next handler
            return undefined;
        });
    };

    // serialize a pipeline
    function cmdChainToPrompt(cmd) {
        var argvs = [];
        // couldn't resist.
        mapCmdTree(cmd, function (cmd) {
            var argv = cmd.getArgv().map(pescape);
            argvs.push.apply(argvs, argv);
            if (cmd.stdoutto > 0) {
                argvs.push('|');
            }
        });
        return argvs.join(' ');
    }

    function stopMonitoringCmd(cmd) {
        if (!(cmd instanceof Command)) {
            throw "argument to stopMonitoringCmd must be a Command instance";
        }
        delete cmd._prepareCmdForSyncSanityCheck;
        $(cmd).off('.terminal');
    }

    function stopMonitoringTree(root) {
        mapCmdTree(root, stopMonitoringCmd);
    }

    // (One-way) sync a command to this cli object: cmd changes -> update me.
    Cli.prototype._monitorCommandChanges = function (cmd) {
        var cli = this;
        // when the associated command (args or cmd) is updated from outside
        $(cmd).on('updated.args.cmd.terminal', function (e, by) {
            var cmd = this;
            if (by == cli._guid || by == 'init') {
                // ignore init and myself
                return;
            }
            var newprompt = cmdChainToPrompt(cli._cmd);
            // not a jQuery event because I want to crash if unhandled
            cli.onUpdatedPrompt(newprompt);
        });
        $(cmd).on('updated.status.terminal', function (e) {
            var cmd = this;
            // if currently bound command is started
            if (cmd.status.code > 0) {
                // once started, stop worrying about changes
                stopMonitoringCmd(cmd);
                var root = cmds[cmd.gid];
                // this command is (part of) the synchronised command tree
                if (root === cli._cmd) {
                    // what now? that is the big question. what now. take a step
                    // back and look at the situation. the user types:
                    //
                    // find -name '*.[ch]' -print0 | xargs -0 cat | wc -l
                    //
                    // without commiting (hitting enter). this consumes three
                    // command objects from the pre-allocation pool and sets
                    // them up in line with the prompt.
                    //
                    // now, he (or somebody / something else) starts the xargs
                    // command asynchronously, through the widget. what do we do
                    // with the prepared commands? with the prompt? can't just
                    // leave it hanging around like that; if he changes the sort
                    // command in the prompt this causes an update to the argv
                    // of a running command---a client error.
                    //
                    // the easiest thing to do here, by far, is to just flush
                    // the entire tree of prepared commands and start again.
                    // it's not (at all) what the user expects, unfortunately.
                    //
                    // by disconnecting the root of this tree from the cli the
                    // updates to the cli cannot be propagated to the commands
                    // anymore. an update causes a search for the ._cmd, if that
                    // is not found an entirely new tree is created.
                    cli._cmd = undefined;
                    // however, changes to the commands themselves are still
                    // sent to the cli. that needs to stop as well.
                    stopMonitoringTree(root);
                }
            }
        });
    };

    // When a command is synced with this CLI certain bookkeeping applies: if
    // the command is ever updated from the outside, the CLI must know! How? By
    // hooking to every (significant) update, checking who caused the update,
    // and taking appropriate action.
    Cli.prototype._prepareCmdForSync = function (cmd) {
        var cli = this;
        if (!(cmd instanceof Command)) {
            throw "Argument to _prepareCmdForSync must be a Command";
        }
        // Sneaky integrity check
        if (cmd._prepareCmdForSyncSanityCheck !== undefined) {
            throw "_prepareCmdForSync already called on this command";
        }
        cmd._prepareCmdForSyncSanityCheck = true;
        cli._monitorCommandChanges(cmd);
    };

    // the user updated the prompt: call this method to notify the cli object.
    // what will the cli object do? that is the topic of tonight's "hraban
    // writes documentation".
    //
    // 1. it will PARSE the input, transforming a STRING into an AST (see Ast
    // class for info on that structure).
    //
    // 2. it will take that AST and synchronize it to the "synced commands",
    // reflecting the changes to the command line in the corresponding widgets.
    //
    // 3. it will do everything on hraban's todo list, freeing up his day for
    // happy times.
    //
    // :(
    //
    // if ignoreParseError is true parse errors will be ignored when updating
    // the synced commands.
    Cli.prototype.setprompt = function (txt, ignoreParseError) {
        var cli = this;
        if (!(typeof txt == "string")) {
            throw "argument to setprompt must be the raw prompt, as a string";
        }
        var ast = cli._parse(txt, ignoreParseError);
        cli._syncingPrompt = cli._syncPrompt(ast);
    };

    // commit the current prompt ([enter] button)
    Cli.prototype.commit = function () {
        var cli = this;
        if (!cli._cmd) {
            throw "cmd not ready";
        }
        var root = cli._cmd;
        cli._cmd = undefined;
        var runningCmds = 0;
        // archive when everybody completes succesfully
        var cmdDone = function (e, status) {
            if (status.code == 2) {
                // success!
                runningCmds -= 1;
            } else {
                // ohnoes!
                // setting to -1 will prevent the counter from ever reaching 0
                runningCmds = -1;
                cli.onerror(status.err);
            }
            if (runningCmds == 0) {
                // all commands in this pipeline have completed succesfully
                root.setArchivalState(true);
            }
        };
        cli._syncingPrompt.done(function () {
            // when the prompt has been set, all commands can be started.
            mapCmdTree(root, function (cmd) {
                cmd.start();
                runningCmds += 1;
                $(cmd).one('done', cmdDone);
            });
        });
    };

    // user hit <tab>. assumes pointer is at end of input, as previously set
    // with setprompt(). oo! bery easy!
    Cli.prototype.complete = function (callback) {
        var cli = this;
        var cmd = cli._cmd;
        if (!cmd) {
            // TODO: prettier
            throw "cmd not ready for tab completion";
        }
        var ctx = cli._parserctx;
        var argv = ctx.ast.argv;
        if (argv.length < 2) {
            // only works on filenames
            // TODO: also on executables plz
            return;
        }
        var partial = argv.pop();
        var pattern = punescape(partial) + "*";
        $.get('/files.json', {pattern: pattern}).done(function (options) {
            // also pass the partial to the callback here because he needs it.
            // TODO should that stuff not be handled here then? too tired and
            // hungry to think about that
            callback(partial, options.map(pescape));
        });
    };

    return Cli;
});
