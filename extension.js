import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Gvc from 'gi://Gvc';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

const FALLBACK_CLI_COMMAND = '/usr/bin/mf-cli';
const OFF_DELAY_MS = 2000;
const IGNORED_APPS = new Set([
    'org.gnome.VolumeControl',
    'org.PulseAudio.pavucontrol',
]);
const SYSFS_PATH = '/dev/minifuse_cmd';
const KMOD_PATH = 'kmod/minifuse_mod.ko';

const MiniFuseQuickToggle = GObject.registerClass(
class MiniFuseQuickToggle extends QuickSettings.QuickToggle {
    _init(extension) {
        super._init({
            title: 'MiniFuse',
            subtitle: '48V',
            iconName: 'audio-input-microphone-symbolic',
            toggleMode: true,
        });

        this._extension = extension;
        this.connect('clicked', () => this._extension.togglePhantomPower());
    }
});

const MiniFuseQuickIndicator = GObject.registerClass(
class MiniFuseQuickIndicator extends QuickSettings.SystemIndicator {
    _init(extension) {
        super._init();

        this._extension = extension;
        this._toggle = new MiniFuseQuickToggle(extension);
        this.quickSettingsItems.push(this._toggle);
        this.sync();
    }

    sync() {
        const enabled = this._extension.getPhantomPowerState();
        this._toggle.checked = enabled;
        this._toggle.title = 'MiniFuse 48V';
        this._toggle.subtitle = enabled ? 'Phantom an' : 'Phantom aus';
        this._toggle.iconName = 'audio-input-microphone-symbolic';
    }

    destroy() {
        this._toggle?.destroy();
        this._toggle = null;
        super.destroy();
    }
});

export default class MiniFuse48vAutomationExtension extends Extension {
    enable() {
        this._loadStylesheet();
        this._helperCommand = this._resolveHelperCommand();
        this._createTopBarPill();
        this._createQuickSettingsItem();
        this._ensureKernelModule();

        this._mixer = new Gvc.MixerControl({name: 'MiniFuse 48V Automation'});
        this._signals = [];
        this._offTimeoutId = 0;
        this._controlReady = false;
        this._phantomEnabled = false;
        this._activityActive = false;
        this._activitySignalsConnected = false;

        this._signals.push(this._mixer.connect('state-changed', (_control, state) => {
            if (state === Gvc.MixerControlState.READY) {
                this._controlReady = true;
                this._watchForActivity();
                this._evaluateActivity();
            }
        }));

        this._mixer.open();
    }

    disable() {
        this._cancelOffTimeout();

        this._destroyQuickSettingsItem();
        this._destroyTopBarPill();
        this._unloadStylesheet();

        if (this._mixer) {
            for (const signalId of this._signals)
                this._mixer.disconnect(signalId);
            this._signals = [];

            try {
                this._mixer.close();
            } catch (error) {
                logError(error, 'MiniFuse 48V Automation: mixer close failed');
            }

            this._mixer = null;
        }

        this._controlReady = false;
        this._activityActive = false;
        this._activitySignalsConnected = false;
    }

    getPhantomPowerState() {
        return this._phantomEnabled;
    }

    togglePhantomPower() {
        this._setPhantomPower(!this._phantomEnabled);
    }

    _loadStylesheet() {
        const path = this.path;
        if (!path)
            return;

        this._stylesheetFile = Gio.File.new_for_path(`${path}/stylesheet.css`);
        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        if (this._stylesheetFile.query_exists(null))
            theme.load_stylesheet(this._stylesheetFile);
    }

    _resolveHelperCommand() {
        const candidates = [
            GLib.build_filenamev([this.path, 'bin', 'mf-cli']),
            GLib.build_filenamev([this.path, 'vendor', 'mf-cli', 'target', 'release', 'mf-cli']),
            FALLBACK_CLI_COMMAND,
        ];

        for (const candidate of candidates) {
            if (GLib.file_test(candidate, GLib.FileTest.EXISTS | GLib.FileTest.IS_EXECUTABLE))
                return candidate;
        }

        return FALLBACK_CLI_COMMAND;
    }

    _ensureKernelModule() {
        if (GLib.file_test(SYSFS_PATH, GLib.FileTest.EXISTS))
            return;

        const kmodFile = Gio.File.new_for_path(
            GLib.build_filenamev([this.path, KMOD_PATH]),
        );

        if (!kmodFile.query_exists(null))
            return;

        const argv = ['pkexec', 'insmod', kmodFile.get_path()];
        try {
            Gio.Subprocess.new(argv,
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
        } catch (error) {
            logError(error, 'MiniFuse 48V Automation: failed to load kernel module');
        }
    }

    _unloadStylesheet() {
        if (!this._stylesheetFile)
            return;

        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        try {
            theme.unload_stylesheet(this._stylesheetFile);
        } catch (error) {
            logError(error, 'MiniFuse 48V Automation: stylesheet unload failed');
        }

        this._stylesheetFile = null;
    }

    _createTopBarPill() {
        this._topBarPill = new PanelMenu.Button(0.5, 'MiniFuse 48V', true);

        this._topBarPillActor = new St.BoxLayout({
            style_class: 'minifuse-48v-pill',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._topBarLabel = new St.Label({
            text: '48V',
            style_class: 'minifuse-48v-pill-label',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._topBarPillActor.add_child(this._topBarLabel);
        this._topBarPill.add_child(this._topBarPillActor);
        this._topBarPill.visible = false;

        Main.panel.addToStatusArea('minifuse-48v-pill', this._topBarPill, 0, 'right');
    }

    _destroyTopBarPill() {
        this._topBarPill?.destroy();
        this._topBarPill = null;
        this._topBarPillActor = null;
        this._topBarLabel = null;
    }

    _createQuickSettingsItem() {
        this._quickSettingsIndicator = new MiniFuseQuickIndicator(this);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._quickSettingsIndicator);
    }

    _destroyQuickSettingsItem() {
        this._quickSettingsIndicator?.destroy();
        this._quickSettingsIndicator = null;
    }

    _syncUi() {
        const enabled = this._phantomEnabled;

        if (this._topBarPill)
            this._topBarPill.visible = enabled;

        this._quickSettingsIndicator?.sync();
    }

    _watchForActivity() {
        if (!this._mixer || this._activitySignalsConnected)
            return;

        const refresh = () => this._evaluateActivity();

        this._signals.push(this._mixer.connect('stream-added', refresh));
        this._signals.push(this._mixer.connect('stream-removed', refresh));
        this._signals.push(this._mixer.connect('stream-changed', refresh));
        this._signals.push(this._mixer.connect('default-source-changed', refresh));
        this._activitySignalsConnected = true;
    }

    _evaluateActivity() {
        if (!this._mixer || !this._controlReady)
            return;

        const active = this._hasMicSourceOutput();

        if (active) {
            this._activityActive = true;
            this._cancelOffTimeout();
            this._setPhantomPower(true);
            return;
        }

        this._activityActive = false;
        this._schedulePhantomOff();
    }

    _hasMicSourceOutput() {
        const sourceOutputs = this._mixer.get_source_outputs() ?? [];

        for (let i = 0; i < sourceOutputs.length; i++) {
            const output = sourceOutputs[i];
            const appId = output.get_application_id ? output.get_application_id() : '';
            if (IGNORED_APPS.has(appId))
                continue;

            return true;
        }

        return false;
    }

    _schedulePhantomOff() {
        if (this._offTimeoutId || !this._phantomEnabled)
            return;

        this._offTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, OFF_DELAY_MS, () => {
            this._offTimeoutId = 0;

            if (!this._activityActive)
                this._setPhantomPower(false);

            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelOffTimeout() {
        if (!this._offTimeoutId)
            return;

        GLib.Source.remove(this._offTimeoutId);
        this._offTimeoutId = 0;
    }

    _setPhantomPower(enable) {
        if (this._phantomEnabled === enable)
            return;

        try {
            const proc = Gio.Subprocess.new(
                [this._helperCommand ?? FALLBACK_CLI_COMMAND, '48v', enable ? 'on' : 'off'],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
            );

            proc.wait_check_async(null, (subprocess, result) => {
                try {
                    subprocess.wait_check_finish(result);
                    this._phantomEnabled = enable;
                    this._syncUi();
                } catch (error) {
                    logError(error, 'MiniFuse 48V Automation: helper exited with error');
                }
            });
        } catch (error) {
            logError(error, 'MiniFuse 48V Automation: failed to run helper');
        }
    }
}
