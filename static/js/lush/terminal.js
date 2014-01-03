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

"use strict";


// TERMINAL HANDLING

define(["jquery", "lush/Cli", "lush/utils", "jquery.terminal", "jquery.ui"],
       function ($, Cli) {
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
                if (cli === undefined) {
                    return;
                }
                try {
                    cli.setprompt(txt);
                } catch (e) {
                    // ignore ParseErrors
                    if (!(e instanceof Cli.ParseError)) {
                        throw e;
                    }
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
        cli.onUpdatedPrompt = function (txt) {
            // hack to prevent the onCommandChange handler from sending this
            // change back to the command object. justified because the real
            // solution is a better jQuery.terminal API imo.
            var tempcli = cli;
            cli = undefined;
            $term.set_command(txt);
            cli = tempcli;
        };
        return $term;
    };
});
