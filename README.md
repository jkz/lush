Lush is a shell that is accessible over HTTP instead of through a terminal
emulator.

It is not technically a (login) shell but it aims to provide the functionality
of logging in to a server with ssh.

The goal of lush is to reinvent interaction with an operating system. Currently
there are two major players: the command line and graphical shells. Lush is a
third option that leverages the webbrowser as the UI.

Download and install:

    $ go get github.com/hraban/lush

To run the program find the executable (somewhere in $GOPATH/bin/..) and launch
it. E.g.:

    $ ${GOPATH%%:*}/bin/lush

Also works on Windows provided you installed Go and Git (which is surprisingly
easy using the official installers).

The code is available on github at https://github.com/hraban/lush

Feel free to contact me for more info

Hraban Luyat
hraban@0brg.net
2013
