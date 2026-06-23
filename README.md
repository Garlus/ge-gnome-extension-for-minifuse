# MiniFuse 48V Automation

GNOME Shell 50 extension that enables MiniFuse phantom power when a microphone stream appears.

**Self-contained** – es enthält das `mf-cli`-Binary und das Kernel-Modul
direkt mit. Keine externe Installation nötig.

## Features

- Automatisches Ein/Aus von Phantom Power (+48V) bei Mikrofon-Nutzung
- Top-Bar-Pill zeigt den 48V-Status
- Quick-Settings-Toggle für manuelle Steuerung
- Kernel-Modul wird automatisch beim ersten Start geladen (polkit-Dialog)

## Install

```bash
ln -s "$PWD" ~/.local/share/gnome-shell/extensions/minifuse-48v-automation@local
```

GNOME Shell neu laden (`Alt+F2`, `r`) und die Extension aktivieren.

Beim ersten Aktivieren erscheint ein polkit-Dialog – danach läuft alles
 automatisch.

## Build (optional)

```bash
./build.sh
```

Baut `bin/mf-cli` (Rust-Binary) und `kmod/minifuse_mod.ko` (Kernel-Modul)
aus den venderten Quellen. Nur nötig, wenn die Binaries noch nicht im Repo
liegen.

## Kernel-Modul

Die Extension lädt `kmod/minifuse_mod.ko` automatisch über `pkexec insmod`.
Für dauerhafte Nutzung bei jedem Boot:

```bash
sudo cp kmod/minifuse_mod.ko /lib/modules/$(uname -r)/extra/
sudo depmod -a
echo minifuse_mod | sudo tee /etc/modules-load.d/minifuse.conf
```

## Notes

- Die Extension findet `mf-cli` automatisch über `this.path/bin/mf-cli`.
- Ohne Kernel-Modul fällt sie auf Userspace-USB zurück (kann bei aktivem Audio
  fehlschlagen).
- `bin/` und `kmod/*.ko` sind im Repo enthalten – kein externer Build nötig.
