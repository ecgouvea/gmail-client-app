const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
const chalk = require("chalk");

// If modifying these scopes, delete token.json.
const SCOPES = [
  //'https://www.googleapis.com/auth/gmail.readonly'
  'https://mail.google.com/'
];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listLabels(auth) {
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.labels.list({
    userId: 'me',
  });
  const labels = res.data.labels;
  if (!labels || labels.length === 0) {
    console.log('No labels found.');
    return;
  }
  console.log('Labels:');
  labels.forEach((label) => {
    console.log(`- ${label.name}`);
  });
}

/* async function deleteMessages(auth) {
  const gmail = google.gmail({ version: 'v1', auth });
  console.log('Before batch delete');
  const res = await gmail.users.messages.batchDelete({
    userId: 'me',
    ids: ['from:ecgouvea@yahoo.com']
  });
  console.log('After batch delete');
}
*/

getFilterList = async (fileName) => {
  const filteringList = [];
  const contents = await fs.readFile(fileName);
  //console.debug(`contents: ${contents}`);
  const liner = new String(contents).split(/\r?\n/)
  //console.debug(`liner: typeof ${typeof liner} , length ${liner.length} , content: ${liner}`);
  while (line = liner.pop()) {
    //console.debug(`line: ${line}`);
    filteringList.push(line.toString("utf8"));
  }
  //console.debug(`filteringList: ${filteringList}`);
  return filteringList;
};

async function deleteBatch(auth, list) {
  const gmail = google.gmail({ version: "v1", auth });
  //console.debug(list);

  let res = await gmail.users.messages.batchDelete({
    userId: "me",
    resource: { ids: list },
  });

  console.debug(`Delete result: ${res}`);

}

async function deleteMessageWrapper(auth) {
  console.log(
    chalk.blue(
      `Started delete operation------------------------------------------------`
    )
  );
  const batchLimit = 1000;
  const filteringList = await getFilterList("filterlist.text");
  let finalResult = [];
  let result = await filteringList.forEach(async (item) => {
    let result = await getMessagesByFilter(auth, item);
    let no0fBatches = Math.ceil(result.length / batchLimit);

    console.debug(`no0fBatches: ${no0fBatches}`);

    let batchCount = 1;

    for (let i = 0; i < no0fBatches; i++) {

      let previousBatchCount = batchCount;
      console.debug(`Before deleting batch #${batchCount++}`);

      let ids = [];
      for (let j = i * batchLimit; j < i * batchLimit + batchLimit; j++) {
        if (result[j]) {
          ids.push(result[j]);
        } else {
          break;
        }
      }
      let resultNew = await deleteBatch(auth, ids);

      console.debug(`After deleting batch #${previousBatchCount}`);

    }

    finalResult.push({
      Filter: item,
      Mails_Fetched: result.length,
    });

    if (filteringList.length === finalResult.length) {
      console.log(
        chalk.red(
          `Deleted items summary------------------------------------------------`
        )
      );
      console.table(finalResult);
    }
  });
}

async function getMessagesByFilter(auth, filter, token = "", result = []) {
  const gmail = google.gmail({ version: "v1", auth });
  let res = await gmail.users.messages.list({
    userId: "me",
    maxResults: 500,
    pageToken: token,
    q: filter,
  });

  if (res && res.data) {
    let messages = res.data.messages;
    if (messages && messages.length) {
      let i = 1;
      messages.forEach((message) => {
        //console.debug(`message ${i++}: ${message}`);
        result.push(message.id)
      });

      if (res.data.nextPageToken) {
        result = await getMessagesByFilter(
          auth,
          filter,
          res.data.nextPageToken,
          result
        );
      }
    }
  }
  return result;
}

authorize().then(deleteMessageWrapper).catch(console.error);