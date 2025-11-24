const PREDEFINED = require("./predefined");
const COMMONS = require("./commons");
const SERVERS_MANAGER = require("./serversManager");
const FILE_MANAGER = require("./fileManager");
const MULTILANG = require("./multiLanguage");
const ERRORS_PARSER = require("./minecraftErrorsParser");

const fs = require("fs");
const path = require("path");
const treekill = require("tree-kill");
const spParser = require("minecraft-server-properties");
const {spawn} = require("node:child_process");
const mcs = require("node-mcstatus");
const tar = require("tar");
const moment = require("moment");
const schedule = require("node-schedule");

global.serversInstances = {};
global.instancesLogs = {};
global.scheduledJobs = {};
global.restartAttempts = {};
global.serversToManualRestart = [];

// Проверить готовность сервера к запуску
exports.isServerReadyToStart = (serverName) => {
    let serverStarterPath = this.getStartFilePath(serverName);
    if (serverStarterPath === false) {
        return false;
    }
    return Object.keys(serversConfig).includes(serverName) && serversConfig[serverName].status === PREDEFINED.SERVER_STATUSES.STOPPED && fs.existsSync(serverStarterPath);
};

// Получить кол-во строк из лога сервера
exports.getServerLog = (serverName, linesCountMinus = -100) => {
    if (COMMONS.isObjectsValid(instancesLogs[serverName])) {
        return instancesLogs[serverName].split(/\r?\n/).slice(linesCountMinus).join("\r\n").replaceAll(/\</gim, "&lt;").replaceAll(/\>/gim, "&gt;");
    }
    return "";
};

// Добавить текст в лог сервера
exports.writeServerLog = (serverName, data) => {
    instancesLogs[serverName] = instancesLogs[serverName] + data;
    return true;
};

// Провести обрезку логов серверов в памяти до определённого количества строк
exports.doServersLogsCleanup = () => {
    Object.keys(instancesLogs).forEach(serverName => {
        instancesLogs[serverName] = instancesLogs[serverName].split(/\r?\n/)
            .slice(PREDEFINED.MAX_SERVER_LOGS_LENGTH_MINUS)
            .join("\r\n");
    });
    return true;
};

// Подготовить сервер к запуску (возвращает параметры запуска для сервера)
exports.prepareServerToStart = (serverName) => {
    instancesLogs[serverName] = "";
    let serverStarterPath = this.getStartFilePath(serverName);
    if (serverStarterPath === false) {
        return false;
    }
    let spawnArgs = [];
    // Создаём аргументы для spawn и путь к файлу в зависимости от платформы
    if (process.platform === "win32") {
        spawnArgs[0] = path.resolve(serverStarterPath);
    } else if (process.platform === "linux") {
        spawnArgs[0] = "sh";
        spawnArgs[1] = [path.resolve(serverStarterPath)];
    } else {
        return false;
    }
    SERVERS_MANAGER.setServerStatus(serverName, PREDEFINED.SERVER_STATUSES.STARTING);
    return {
        path: serverStarterPath,
        spawnArgs: spawnArgs
    };
};

// Остановить сервер
exports.stopServer = (serverName) => {
    if (SERVERS_MANAGER.isServerExists(serverName) && SERVERS_MANAGER.getServerStatus(serverName) === PREDEFINED.SERVER_STATUSES.RUNNING) {
        this.writeToStdin(serverName, SERVERS_MANAGER.getServerInfo(serverName).stopCommand);
        return true;
    }
    return false;
}

// Запустить сервер
exports.startServer = (serverName) => {
    if (this.isServerReadyToStart(serverName)) {
        // Получаем параметры запуска и производим запуск
        let startProps = this.prepareServerToStart(serverName);
        if (startProps !== false) {
            // Создаём spawn и добавляем хэндлеры
            if (startProps.spawnArgs.length === 1) {
                serversInstances[serverName] = spawn(`"${startProps.spawnArgs[0]}"`, {shell: true});
            } else if (startProps.spawnArgs.length === 2) {
                serversInstances[serverName] = spawn(`"${startProps.spawnArgs[0]}"`, startProps.spawnArgs[1], {shell: true});
            } else {
                return false;
            }
            this.addInstanceCloseEventHandler(serverName);
            this.addInstanceStdEventHandler(serverName);
            return true;
        }
    }
    return false;
};

// Перезапустить сервер
exports.restartServer = (serverName) => {
    serversToManualRestart.push(serverName);
    this.stopServer(serverName);
    return true;
};

// Добавить handler для закрытия на instance
exports.addInstanceCloseEventHandler = (serverName) => {
    serversInstances[serverName].on("close", (code) => {
        SERVERS_MANAGER.setServerStatus(serverName, PREDEFINED.SERVER_STATUSES.STOPPED);
        if (code != null && code > 1 && code !== 127) {
            // Если сервер завершился НЕНОРМАЛЬНО
            this.writeServerLog(serverName, MULTILANG.translateText(currentLanguage, "{{serverConsole.stopCode}}", code));
            if (serversConfig[serverName].restartOnError === true) {
                if (restartAttempts[serverName] >= serversConfig[serverName].maxRestartAttempts) {
                    // Если не удалось запустить сервер после макс. кол-ва попыток
                    this.writeServerLog(serverName, MULTILANG.translateText(currentLanguage, "{{serverConsole.restartFailed}}", restartAttempts[serverName]));
                } else {
                    // Пробуем перезапустить сервер
                    if (COMMONS.isObjectsValid(restartAttempts[serverName])) {
                        restartAttempts[serverName]++;
                    } else {
                        restartAttempts[serverName] = 1;
                    }
                    this.writeServerLog(serverName, MULTILANG.translateText(currentLanguage, "{{serverConsole.restartAttempt}}", restartAttempts[serverName]));
                    this.startServer(serverName);
                }
            }
        } else if (code === 1 || code === 127) {
            // Если сервер был убит
            this.writeServerLog(serverName, MULTILANG.translateText(currentLanguage, "{{serverConsole.killed}}"));
        } else {
            this.writeServerLog(serverName, MULTILANG.translateText(currentLanguage, "{{serverConsole.gracefulShutdown}}"));
            // Перезапускаем сервер, если он есть в массиве для перезапуска
            if(serversToManualRestart.includes(serverName)){
                this.startServer(serverName);
                serversToManualRestart.splice(serversToManualRestart.indexOf(serverName), 1);
            }
        }
    });
};

// Обрабатываем выходные потоки сервера
exports.handleServerStd = (serverName, data) => {
    //data = iconvlite.decode(data, "utf-8").toString();
    data = data.toString();
    this.writeServerLog(serverName, data);
    // Проверяем на ошибки
    let isAnyErrorsHere = ERRORS_PARSER.checkStringForErrors(data);
    if(isAnyErrorsHere !== false){
        // Добавляем в лог описание найденных ошибок
        this.writeServerLog(serverName, "§c§l" + MULTILANG.translateText(currentLanguage, isAnyErrorsHere));
    }

    // Проверяем маркеры смены статуса
    Object.keys(PREDEFINED.SERVER_STATUS_CHANGE_MARKERS).forEach((key) => {
        if (COMMONS.testForRegexArray(data, PREDEFINED.SERVER_STATUS_CHANGE_MARKERS[key])) {
            // При нахождении маркера меняем статус
            SERVERS_MANAGER.setServerStatus(serverName, PREDEFINED.SERVER_STATUSES[key]);
        }
    });
};

// Добавить хэндлер на stdout и stderr сервера
exports.addInstanceStdEventHandler = (serverName) => {
    serversInstances[serverName].stdout.on("data", (data) => {
        this.handleServerStd(serverName, data);
    });
    serversInstances[serverName].stderr.on("data", (data) => {
        this.handleServerStd(serverName, data);
    });
};

// Отправить текст в stdin сервера (в консоль)
exports.writeToStdin = (serverName, data) => {
    if (COMMONS.isObjectsValid(serversInstances[serverName])) {
        data = Buffer.from(data, "utf-8").toString();
        this.writeServerLog(serverName, data + "\n");
        serversInstances[serverName].stdin.write(data + "\n");
        return true;
    }
    return false;
};

// Принудительно завершить сервер
exports.killServer = (serverName) => {
    if (COMMONS.isObjectsValid(serversInstances[serverName], serversInstances[serverName].pid)) {
        treekill(serversInstances[serverName].pid, () => {
        });
        return true;
    }
    return false;
};

// Получить скрипт запуска сервера
exports.getStartScript = (serverName) => {
    let startFileData, startFilePath;
    if (SERVERS_MANAGER.isServerExists(serverName)) {
        startFilePath = this.getStartFilePath(serverName);
        startFileData = fs.readFileSync(startFilePath);
        startFileData = startFileData.toString().split("\n");
        return startFileData[startFileData.length - 1];
    }
    return false;
};

// Записать скрипт запуска сервера
exports.setStartScript = (serverName, data) => {
    let startFileData, startFilePath;
    if (SERVERS_MANAGER.isServerExists(serverName)) {
        startFilePath = this.getStartFilePath(serverName);
        startFileData = fs.readFileSync(startFilePath);
        startFileData = startFileData.toString().split("\n");
        startFileData[startFileData.length - 1] = data;
        fs.writeFileSync(startFilePath, startFileData.join("\n"));
        return true;
    }
    return false;
};

// Сгенерировать путь к файлу запуска сервера
exports.getStartFilePath = (serverName) => {
    if (process.platform === "win32") {
        return "./servers/" + serverName + "/start.bat";
    } else if (process.platform === "linux") {
        return "./servers/" + serverName + "/start.sh";
    } else {
        return false;
    }
};

// Получить файл server.properties (после парсинга)
exports.getServerProperties = (serverName) => {
    let spFilePath = "./servers/" + serverName + "/server.properties";
    if (fs.existsSync(spFilePath)) {
        let spFileData = fs.readFileSync(spFilePath).toString();
        let parsed = spParser.parse(spFileData);
        if(parsed['generator-settings']){
            parsed['generator-settings'] = JSON.stringify(parsed['generator-settings']);
        }
        return parsed;
    }
    return false;
};

// Сохранить файл server.properties
exports.saveServerProperties = (serverName, data) => {
    let parsed = JSON.parse(data);
    let result = "";
    for (const [key, value] of Object.entries(parsed)) {
        result += "\n" + key.toString() + "=" + value.toString();
    }
    FILE_MANAGER.writeFile(serverName, "/server.properties", result);
    return true;
};

// Получить информацию о сервере
exports.queryServer = (serverName, cb) => {
    let spData = this.getServerProperties(serverName);
    if (COMMONS.isObjectsValid(spData['server-port']) && COMMONS.isObjectsValid(serversInstances[serverName])) {
        let chkPort = spData['server-port'];
        const chkOptions = {query: false};
        mcs.statusJava("127.0.0.1", chkPort, chkOptions)
            .then((result) => {
                cb(result);
            })
            .catch((error) => {
                console.error(error);
                cb(false);
            })
    } else {
        cb(false);
    }
}

// Проверка и удаление старых бэкапов
exports.enforceBackupLimit = (serverName, type) => {
    const serverInfo = SERVERS_MANAGER.getServerInfo(serverName);
    if (!serverInfo || !serverInfo.backupConfig) return;

    let limit = type === 'manual' ? serverInfo.backupConfig.manualLimit : serverInfo.backupConfig.autoLimit;
    if (!limit || limit <= 0) return;

    let backupDir = path.resolve("./servers/" + serverName + "/backups");
    if (!fs.existsSync(backupDir)) return;

    let prefix = type === 'manual' ? 'manual_backup_' : 'auto_backup_';

    fs.readdir(backupDir, (err, files) => {
        if (err) return;

        let backups = files.filter(file => file.startsWith(prefix));

        // Sort by creation time (older first)
        backups.sort((a, b) => {
            let statA = fs.statSync(path.join(backupDir, a));
            let statB = fs.statSync(path.join(backupDir, b));
            return statA.mtime.getTime() - statB.mtime.getTime();
        });

        while (backups.length > limit) {
            let toDelete = backups.shift(); // Oldest
            fs.unlink(path.join(backupDir, toDelete), (err) => {
                if (!err) {
                    this.writeServerLog(serverName, `[Backups] Deleted old backup: ${toDelete}`);
                }
            });
        }
    });
};

// Создать бэкап сервера
exports.backupServer = (serverName, type = 'manual') => {
    if (!SERVERS_MANAGER.isServerExists(serverName)) {
        return false;
    }

    let wasRunning = SERVERS_MANAGER.getServerStatus(serverName) === PREDEFINED.SERVER_STATUSES.RUNNING;
    let prefix = type === 'manual' ? 'manual_backup_' : 'auto_backup_';

    const performBackup = () => {
        let spData = this.getServerProperties(serverName);
        let worldName = spData && spData["level-name"] ? spData["level-name"] : "world";
        let backupDir = path.resolve("./servers/" + serverName + "/backups");

        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        let timestamp = moment().format("YYYY-MM-DD_HH-mm-ss");
        let backupFile = `${prefix}${worldName}_${timestamp}.tar`;
        let backupPath = path.join(backupDir, backupFile);

        this.writeServerLog(serverName, `[Backups] Starting ${type} backup of world '${worldName}'...`);

        tar.create(
            {
                gzip: false,
                file: backupPath,
                cwd: path.resolve("./servers/" + serverName)
            },
            [worldName]
        ).then(() => {
            this.writeServerLog(serverName, `[Backups] Backup completed: ${backupFile}`);

            // Check limits after successful backup
            this.enforceBackupLimit(serverName, type);

            if (wasRunning) {
                this.writeServerLog(serverName, "[Backups] Restarting server...");
                this.startServer(serverName);
            }
        }).catch((err) => {
            this.writeServerLog(serverName, `[Backups] Backup failed: ${err.message}`);
            console.error(err);
        });
    };

    if (wasRunning) {
        this.writeServerLog(serverName, "[Backups] Stopping server for backup...");
        this.stopServer(serverName);

        let checkInterval = setInterval(() => {
            if (SERVERS_MANAGER.getServerStatus(serverName) === PREDEFINED.SERVER_STATUSES.STOPPED) {
                clearInterval(checkInterval);
                performBackup();
            }
        }, 1000);
    } else {
        performBackup();
    }

    return true;
};

// Планирование авто-бэкапа
exports.scheduleAutoBackup = (serverName) => {
    // Cancel existing job
    if (scheduledJobs[serverName]) {
        scheduledJobs[serverName].cancel();
        delete scheduledJobs[serverName];
    }

    const serverInfo = SERVERS_MANAGER.getServerInfo(serverName);
    if (!serverInfo || !serverInfo.backupConfig || !serverInfo.backupConfig.autoBackup || !serverInfo.backupConfig.autoBackup.enabled) {
        return;
    }

    const config = serverInfo.backupConfig.autoBackup;
    const [hour, minute] = config.time.split(':');

    let rule = new schedule.RecurrenceRule();
    rule.hour = parseInt(hour);
    rule.minute = parseInt(minute);

    if (config.timezone) {
        rule.tz = config.timezone;
    }

    if (config.frequency === 'day') {
        // Every day at HH:MM
    } else if (config.frequency === 'week') {
        rule.dayOfWeek = 1; // Monday? User didn't specify day of week. Assume Monday or let default?
        // "Every Week" usually means once a week. I'll default to Monday (1).
        // Actually, cron syntax is simpler if node-schedule supports it fully with timezone? Yes.
        // But RecurrenceRule is better for timezone.
    } else if (config.frequency === 'month') {
        rule.date = 1; // 1st of month
    }

    try {
        scheduledJobs[serverName] = schedule.scheduleJob(rule, () => {
            this.writeServerLog(serverName, "[Backups] Starting scheduled auto-backup...");
            this.backupServer(serverName, 'auto');
        });
        this.writeServerLog(serverName, `[Backups] Scheduled auto-backup (${config.frequency} at ${config.time} ${config.timezone || 'UTC'})`);
    } catch (e) {
        console.error(`Failed to schedule backup for ${serverName}:`, e);
    }
};

// Инициализация планировщиков при запуске
exports.initSchedulers = () => {
    const servers = SERVERS_MANAGER.getServersList();
    servers.forEach(serverName => {
        this.scheduleAutoBackup(serverName);
    });
};

// Получить список бэкапов
exports.getBackupsList = (serverName) => {
    let backupDir = path.resolve("./servers/" + serverName + "/backups");
    if (!fs.existsSync(backupDir)) {
        return [];
    }

    try {
        let files = fs.readdirSync(backupDir);
        let backups = [];

        files.forEach(file => {
            if (file.endsWith(".tar")) {
                let stats = fs.statSync(path.join(backupDir, file));
                backups.push({
                    filename: file,
                    size: stats.size,
                    created: stats.mtime,
                    type: file.startsWith("auto_backup_") ? "auto" : "manual"
                });
            }
        });

        // Sort by date (newest first)
        return backups.sort((a, b) => new Date(b.created) - new Date(a.created));
    } catch (e) {
        console.error(e);
        return [];
    }
};

// Восстановить бэкап
exports.restoreServer = async (serverName, filename) => {
    if (!SERVERS_MANAGER.isServerExists(serverName)) {
        return false;
    }

    let backupPath = path.resolve("./servers/" + serverName + "/backups/" + filename);
    if (!fs.existsSync(backupPath)) {
        this.writeServerLog(serverName, `[Backups] Restore failed: File ${filename} not found.`);
        return false;
    }

    const performRestore = () => {
        return new Promise((resolve, reject) => {
            try {
                let spData = this.getServerProperties(serverName);
                let worldName = spData && spData["level-name"] ? spData["level-name"] : "world";
                let worldPath = path.resolve("./servers/" + serverName + "/" + worldName);

                this.writeServerLog(serverName, `[Backups] Starting restore from ${filename}...`);

                // 1. Delete existing world
                if (fs.existsSync(worldPath)) {
                    this.writeServerLog(serverName, `[Backups] Deleting existing world '${worldName}'...`);
                    fs.rmSync(worldPath, { recursive: true, force: true });
                }

                // 2. Untar backup
                this.writeServerLog(serverName, `[Backups] Extracting backup...`);
                tar.extract({
                    file: backupPath,
                    cwd: path.resolve("./servers/" + serverName)
                }).then(() => {
                    this.writeServerLog(serverName, `[Backups] Restore completed successfully.`);
                    resolve(true);
                }).catch((err) => {
                    this.writeServerLog(serverName, `[Backups] Restore failed: ${err.message}`);
                    console.error(err);
                    resolve(false);
                });
            } catch (err) {
                console.error(err);
                resolve(false);
            }
        });
    };

    // Check if running and stop if necessary
    if (SERVERS_MANAGER.getServerStatus(serverName) === PREDEFINED.SERVER_STATUSES.RUNNING) {
        this.writeServerLog(serverName, "[Backups] Stopping server for restore...");
        this.stopServer(serverName);

        return new Promise((resolve) => {
            let checkInterval = setInterval(() => {
                if (SERVERS_MANAGER.getServerStatus(serverName) === PREDEFINED.SERVER_STATUSES.STOPPED) {
                    clearInterval(checkInterval);
                    performRestore().then(resolve);
                }
            }, 1000);
        });
    } else {
        return await performRestore();
    }
};

// DEVELOPED by seeeroy