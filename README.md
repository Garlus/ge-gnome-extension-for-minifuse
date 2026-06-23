# MiniFuse 48V Automation

GNOME Shell extension that automatically enables MiniFuse phantom power (+48V) when a microphone stream starts, and turns it off when the stream ends.

It is self-contained and includes the required `mf-cli` binary and kernel module. No external installation is needed.

## Features

* Automatic +48V toggling based on microphone activity.
* Top bar indicator showing current 48V status.
* Quick Settings toggle.

## Installation

1. Clone or download this repository.
2. Link or move the directory to your local GNOME Shell extensions folder:

```bash
ln -s "$PWD" ~/.local/share/gnome-shell/extensions/minifuse-48v-automation@local

```

3. Restart GNOME Shell and enable in the Extensions app.

#### Persistent Kernel Module (Optional)

The extension loads the kernel module automatically via `pkexec insmod` on startup. If you prefer to load it automatically at boot, run:

```bash
sudo cp kmod/minifuse_mod.ko /lib/modules/$(uname -r)/extra/
sudo depmod -a
echo minifuse_mod | sudo tee /etc/modules-load.d/minifuse.conf

```

Without the kernel module, the extension falls back to userspace USB communication, which may fail if the audio interface is actively in use.
