const PREDEFINED = require("./predefined");

// Determine the user interface language
const fs = require("fs");
const axios = require("axios");
const path = require("path");

exports.detectUserLocale = () => {
    // Default to English as per requirements, ignoring user locale
    return "en";
};

// Create necessary base directories
exports.makeBaseDirs = () => {
    PREDEFINED.BASE_DIRS.forEach(function (dir) {
        if (!fs.existsSync("./" + dir)) {
            fs.mkdirSync("./" + dir);
        }
    });
};

// Check all objects for !== undefined
exports.isObjectsValid = (...objects) => {
    let validCount = 0;
    let summCount = objects.length;
    objects.forEach(function (obj) {
        if (typeof obj !== "undefined" && obj !== null) {
            validCount++;
        }
    });
    return summCount === validCount;
};

// Get data by URL
exports.getDataByURL = (url, cb) => {
    axios
        .get(url)
        .then(function (response) {
            cb(response.data);
        })
        .catch(function (error) {
            cb(false);
            return console.error(error.data);
        });
};

// Function to move uploaded file to server
exports.moveUploadedFile = (server, sourceFile, filePath, cb) => {
    if (this.isObjectsValid(server, sourceFile.name)) {
        let uploadPath;
        uploadPath = "./servers/" + server + filePath;
        fs.mkdirSync(path.dirname(uploadPath), {recursive: true});
        sourceFile.mv(uploadPath, function (err) {
            if (err) {
                return cb(err);
            }

            cb(true);
        });
    } else {
        cb(400);
    }
}

// Check text for matches with array of regexes
exports.testForRegexArray = (text, regexArray) => {
    let testResult = false;
    regexArray.forEach((regexpItem) => {
        if (typeof regexpItem == "object" && text.match(regexpItem) !== null) {
            testResult = true;
        } else if (typeof regexpItem == "string" && regexpItem === text) {
            testResult = true;
        }
    });
    return testResult;
};

// DEVELOPED by seeeroy