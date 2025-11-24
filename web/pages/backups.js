$(function () {
    KubekUI.setTitle("Kubek | Backups & Schedule");
    loadBackupConfig();
    populateTimezones();

    $("#auto-backup-enabled").on("change", function() {
        if($(this).is(":checked")) {
            $(".schedule-row").show();
        } else {
            $(".schedule-row").hide();
        }
    });

    $("#backup-time, #timezone").on("change", updateLocalTimeHint);

    loadBackupsList();
});

function populateTimezones() {
    const timezones = Intl.supportedValuesOf('timeZone');
    const select = $("#timezone");
    timezones.forEach(tz => {
        if (tz !== 'UTC') {
            select.append(new Option(tz, tz));
        }
    });
}

function loadBackupsList() {
    KubekRequests.get("/servers/" + selectedServer + "/backups", (backups) => {
        const tbody = $("#backups-table tbody");
        tbody.empty();

        if (Array.isArray(backups)) {
            backups.forEach(backup => {
                let sizeStr = (backup.size / 1024 / 1024).toFixed(2) + " MB";
                let dateStr = new Date(backup.created).toLocaleString();

                let row = `
                    <tr>
                        <td>${backup.filename}</td>
                        <td>${backup.type === 'manual' ? '<span class="badge blue">Manual</span>' : '<span class="badge green">Auto</span>'}</td>
                        <td>${dateStr}</td>
                        <td>${sizeStr}</td>
                        <td>
                            <button class="primary-btn danger-btn-color" onclick="confirmRestore('${backup.filename}')">Restore</button>
                        </td>
                    </tr>
                `;
                tbody.append(row);
            });
        }
    });
}

function confirmRestore(filename) {
    // Popup 1
    if (confirm("Are you sure you want to restore this backup? Current world data will be overwritten.")) {
        // Popup 2
        if (confirm("The server will be stopped and the current world folder DELETED. This cannot be undone.")) {
            // Popup 3
            if (confirm("Final Confirmation: Restore backup " + filename + " now?")) {
                performRestore(filename);
            }
        }
    }
}

function performRestore(filename) {
    KubekAlerts.addAlert("Starting restore process...", "restore", "Info", 3000, "blue");

    KubekRequests.post("/servers/" + selectedServer + "/backups/restore?filename=" + Base64.encode(filename), (res) => {
        if (res === true) {
            KubekAlerts.addAlert("Restore completed successfully!", "check_circle", "Success", 5000, "green");
        } else {
            KubekAlerts.addAlert("Restore failed. Check console/logs.", "error", "Error", 5000, "red");
        }
    });
}

function updateLocalTimeHint() {
    const time = $("#backup-time").val();
    const timezone = $("#timezone").val();

    if (time && timezone) {
        $("#local-time-hint").text(`Selected: ${time} ${timezone}`);
    }
}

function loadBackupConfig() {
    KubekRequests.get("/servers/" + selectedServer + "/backups/config", (config) => {
        if (config) {
            $("#manual-limit").val(config.manualLimit || 5);
            $("#auto-limit").val(config.autoLimit || 5);

            if (config.autoBackup) {
                $("#auto-backup-enabled").prop("checked", config.autoBackup.enabled).trigger("change");
                $("#frequency").val(config.autoBackup.frequency || "day");
                $("#backup-time").val(config.autoBackup.time || "00:00");
                $("#timezone").val(config.autoBackup.timezone || "UTC");
            } else {
                $("#auto-backup-enabled").prop("checked", false).trigger("change");
            }
            updateLocalTimeHint();
        }
    });
}

function saveBackupConfig() {
    let config = {
        manualLimit: parseInt($("#manual-limit").val()),
        autoLimit: parseInt($("#auto-limit").val()),
        autoBackup: {
            enabled: $("#auto-backup-enabled").is(":checked"),
            frequency: $("#frequency").val(),
            time: $("#backup-time").val(),
            timezone: $("#timezone").val()
        }
    };

    KubekRequests.post("/servers/" + selectedServer + "/backups/config?data=" + Base64.encode(JSON.stringify(config)), (res) => {
        if (res === true) {
            KubekAlerts.addAlert("Backup configuration saved", "save", "Success", 3000, "green");
        } else {
            KubekAlerts.addAlert("Failed to save configuration", "error", "Error", 3000, "red");
        }
    });
}
