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
