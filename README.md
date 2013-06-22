Lush is a shell that is accessible over HTTP instead of through a terminal
emulator.

It is not technically a (login) shell but it aims to provide the functionality
of logging in to a server with ssh.

The goal of lush is to reinvent interaction with an operating system. Currently
there are two major players: the command line and graphical shells. Lush is a
third option that leverages the webbrowser as the UI.

Download and install:

    $ go get github.com/hraban/lush

To run the program find the executable (somewhere in $GOPATH/bin/) and launch
it. E.g.:

    $ ${GOPATH%%:*}/bin/lush

Also works on Windows provided you installed Go and Git (which is surprisingly
easy using the official installers).

## Installing Go on Windows (7)

Alright I just drank coffee so I can finally write this part without passing out from boredom.

The caffeine is kicking in and life is great.

Listen up the deal here is that to install Go on Windows you have to do **two things: run the installer and set a GOPATH.** I'm not gonna explain why just how. Let's get this over with.

Go installer:

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

GOPATH:

1. **create a new directory called go3d next to where go is installed** (c:\Go by default). e.g. c:\go3d
2. **open the "environment variables" dialog** (windows 7: control panel -> System -> Advanced system settings -> "Advanced" tab -> Environment Variables)
3. **create a new "user variable": name GOPATH, value C:\go3d**
4. victory! hail cthulhu ^(;,;)^

go tool in PATH:

1. **open the "environment variables" dialog**
2. **find the PATH (or Path) variable in the System variables**
3. **edit it and append this to the value: ;C:\go\bin**
4. now you can just type `go` in the command window as all instructions everywhere just assume you can (why this is not done by the installer baffles me)

Now when you use `go get` it will put stuff in C:\go3d.

### install lush

**open a command window and type:**

    go get github.com/hraban/lush

It will download lush (to c:\go3d\src\github.com\hraban\lush) and install it (as c:\go3d\bin\lush.exe).

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
