class KubekServers {
    // Получить список серверов
    static getServersList = (cb) => {
        KubekRequests.get("/servers", cb);
    };

    // Получить информацию о сервере (в т.ч. статус)
    static getServerInfo = (server, cb) => {
        KubekRequests.get("/servers/" + server + "/info", cb);
    };

    // Проверить сервер на существование
    static isServerExists = (server, cb) => {
        this.getServersList((sList) => {
            cb(sList.includes(server));
        });
    };

    // Получить лог сервера
    static getServerLog = (server, cb) => {
        KubekRequests.get("/servers/" + server + "/log", (log) => {
            if(log === false){
                cb("");
            } else {
                cb(log);
            }
        });
    };

    // Отправить команду на сервер
    static sendCommandToServer = (server, cmd) => {
        KubekRequests.get("/servers/" + server + "/send?cmd=" + cmd);
    };

    // Отправить команду на сервер из поля ввода консоли
    static sendCommandFromInput = (server) => {
        let inputElem = $("#cmd-input");
        if(inputElem.length === 1){
            this.sendCommandToServer(server, inputElem.val());
            inputElem.val("");
        }
    };

    // Запустить сервер
    static startServer = (server) => {
        if(currentServerStatus === KubekPredefined.SERVER_STATUSES.STOPPED){
            KubekRequests.get("/servers/" + server + "/start");
        }
    };

    // Перезапустить сервер
    static restartServer = (server) => {
        if(currentServerStatus === KubekPredefined.SERVER_STATUSES.RUNNING){
            KubekRequests.get("/servers/" + server + "/restart");
        }
    };

    // Остановить сервер
    static stopServer = (server) => {
        if(currentServerStatus === KubekPredefined.SERVER_STATUSES.RUNNING){
            KubekRequests.get("/servers/" + server + "/stop");
        }
    };

    // Запросить бэкап сервера
    static askForBackup = (server) => {
        if (currentServerStatus === KubekPredefined.SERVER_STATUSES.RUNNING) {
            KubekNotifyModal.create(
                "Backup Server",
                "The server needs to be stopped to create a backup. Are you sure you want to stop the server and proceed with the backup?",
                "Yes, Stop & Backup",
                "save",
                () => {
                    this.backupServer(server);
                },
                KubekPredefined.MODAL_CANCEL_BTN
            );
        } else if (currentServerStatus === KubekPredefined.SERVER_STATUSES.STOPPED) {
            this.backupServer(server);
        }
    };

    // Выполнить бэкап сервера
    static backupServer = (server) => {
        KubekRequests.post("/servers/" + server + "/backup", () => {
            KubekAlerts.addAlert("Backup process started", "save", "Backups", 5000);
        });
    };
}