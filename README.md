Lush is a shell that is accessible through a browser instead of a terminal
emulator.

It is not technically a "(login) shell" but you use it where you would normally
logging in to a server with ssh. Or instead of opening a terminal on your own computer.

The goal of lush is to reinvent interaction with an operating system. Currently
there are two major players: the command line and graphical shells. Lush is a
third option that leverages the webbrowser as the UI.

## Lush on Linux

Download and install:

    $ go get github.com/hraban/lush

To run the program find the executable (somewhere in $GOPATH/bin/) and launch
it. E.g.:

    $ ${GOPATH%%:*}/bin/lush

## Lush on Windows

Lush works just fine on Windows. The only thing that might disappoint you: it's just a shell. The common tools (ls, grep, find, cat, sed, ...) are not (yet!) provided.

Installing lush on Windows comes in two flavors: download a binary release or install from source.

The binary release will include grep, cat, etc. in v0.3.0 (release date 31 dec 2013).

### Downloading a binary release

Go to:

http://github.com/hraban/lush/releases

Download the latest .zip. Unzip, find lush.exe, double click it. Done.

### Installing lush from source on Windows (7)

To install lush from source on Windows (or anywhere, really) you need:

- **Go**
- **Mercurial**
- **Git**

**This README only helps you with installing Go.** Installing Git and Mercurial is your responsibility (but not hard: download installer, next, next, next, done).

Installing Go on Windows is **two things: run the installer and set a GOPATH.** I'm not gonna explain why just how. Let's get this over with.

#### Go installer:

1. **Go to https://code.google.com/p/go/downloads/list**
2. **Select the MSI installer that matches your system: 32- or 64-bit** (so it ends in windows-386.msi OR windows-amd64.msi).
3. If you selected the 32 bit version it's time for an upgrade man it's 2013 for pete's sake
4. **Download and run that bad boy.** Just click next next next. (wait I gotta run the installer here I forgot how it works)
4. frig it wont run because i already have Go installed what's up with that?! okay lemme uninstall go then
4. argh I can NEVER find that add / remove programs icon in the configuration panel. in fact i can never find anything in there. it's like trying to find the g-spot while piloting a russian jet-fighter upside down
4. ... this uninstaller is taking forever.
5. **Okay in that installer click next next next install**
6. wait for the heat death of the universe
6. ...
6. is defragmenting still a thing?
7. **yay done**

#### GOPATH:

1. **create a new directory called go3d next to where go is installed** (c:\Go by default). e.g. c:\go3d
2. **open the "environment variables" dialog** (windows 7: control panel -> System -> Advanced system settings -> "Advanced" tab -> Environment Variables)
3. **create a new "user variable": name GOPATH, value C:\go3d**
4. victory! hail cthulhu ^(;,;)^

#### go tool in PATH:

This is probably done by the installer already. Open a terminal (start -> run -> cmd.exe) and type "go". If you get a long message from the go tool, great! Otherwise, do this:

1. **open the "environment variables" dialog**
2. **find the PATH (or Path) variable in the System variables**
3. **edit it and append this to the value: ;C:\go\bin** (note the ; to separate it from the previous path. that's a : on UNIX systems btw. you know, in case you were wondering, "gee I wonder what character is used as a separator for entries in the PATH environment variable on UNIX systems", or something along those lines)
5. **reboot?** not sure but probably maybe. I think koen needs to reboot so probably others as well. after changing the Path on windows I mean.
4. now you can just type `go` in the command window

after all this, when you use `go get` it will put stuff in C:\go3d.

#### install lush

**open a command window and type:**

    go get github.com/hraban/lush

It will download lush (to `c:\go3d\src\github.com\hraban\lush`) and install it (as `c:\go3d\bin\lush.exe`).

**Run lush by double clicking the .exe!** Create a shortcut to your desktop for easy access.

To update lush:

    go get -u github.com/hraban/lush

Thats it.

## afterword

The code is available on github at https://github.com/hraban/lush

Feel free to contact me for more info

Hraban Luyat
hraban@0brg.net
2013
