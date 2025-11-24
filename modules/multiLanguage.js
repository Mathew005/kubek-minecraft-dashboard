// Translation format in text: {{category.key}}

const fs = require('fs');
const path = require('path');
// List of codes for available languages
global.avaliableLanguages = {};

// Load list of available languages
exports.loadAvailableLanguages = () => {
    if (fs.existsSync(path.join(__dirname, "./../languages"))) {
        fs.readdirSync(path.join(__dirname, "./../languages")).forEach(file => {
            if (path.extname(file) === ".json") {
                let langFile = JSON.parse(fs.readFileSync(path.join(__dirname, "./../languages", file)).toString());
                if (typeof langFile.info.code !== "undefined" && typeof langFile.info.id !== "undefined" && typeof langFile.info.displayNameEnglish !== "undefined") {
                    avaliableLanguages[langFile.info.code] = langFile.info;
                }
            }
        })
        return true;
    }
    return false;
};

// Get language info by name
exports.getLanguageInfo = (language) => {
    if (Object.keys(avaliableLanguages).includes(language)) {
        return avaliableLanguages[language];
    }
    return false;
};

// Translate all occurrences of translation labels in text
exports.translateText = (language, text, ...placers) => {
    text = text.toString();
    if (Object.keys(avaliableLanguages).includes(language)) {
        let translationFile = JSON.parse(fs.readFileSync(path.join(__dirname, "./../languages", language + ".json")).toString());
        // Search for translation placeholders using regex
        let searchMatches = text.toString().match(/\{{[0-9a-zA-Z\-_.]+\}}/gm);
        if (searchMatches != null) {
            searchMatches.forEach(match => {
                // Clean matches from brackets and split into category and key
                let matchClear = match.replaceAll("{", "").replaceAll("}", "");
                if (matchClear.split(".").length >= 2) {
                    let category = matchClear.split(".")[0];
                    let key = matchClear.split(".")[1];
                    let modificator = matchClear.split(".")[2];
                    // Replace found translations in the text
                    if (typeof translationFile.translations[category][key] !== "undefined") {
                        let matchedTranslation = translationFile.translations[category][key];
                        if(modificator === "upperCase"){
                            matchedTranslation = matchedTranslation.toUpperCase();
                        } else if(modificator === "lowerCase"){
                            matchedTranslation = matchedTranslation.toLowerCase();
                        }
                        text = text.replaceAll(match, matchedTranslation);
                    }
                }
            });
            // Replace text placeholders (%0%, %1%...) with provided objects
            placers.forEach(function (replacement, i) {
                text = text.replaceAll("%" + i + "%", replacement);
            });
        }
        return text;
    }
    return false;
};

// Get EULA for a specific language
exports.getEULA = (language) => {
    if(this.getLanguageInfo(language) !== false){
        let translationFile = JSON.parse(fs.readFileSync("./languages/" + language + ".json").toString());
        return translationFile.eula;
    }
    return false;
};