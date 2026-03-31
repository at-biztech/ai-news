/**
 * Google Apps Script — checks Gmail for Perplexity digest emails
 * and triggers GitHub Actions workflow.
 *
 * Setup:
 * 1. Paste this into script.google.com
 * 2. Add Script Properties:
 *    - GITHUB_TOKEN: GitHub fine-grained PAT with Contents read/write
 *    - GITHUB_REPO: username/repo-name
 *    - SENDER_FILTER: perplexity (or adjust to match your sender)
 * 3. Create hourly time-based trigger for checkForDigest
 * 4. Run checkForDigest once manually to grant Gmail permissions
 */

function checkForDigest() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('GITHUB_TOKEN');
  var repo = props.getProperty('GITHUB_REPO');
  var sender = props.getProperty('SENDER_FILTER') || 'perplexity';

  if (!token || !repo) {
    Logger.log('Missing GITHUB_TOKEN or GITHUB_REPO in Script Properties');
    return;
  }

  var query = 'from:' + sender + ' newer_than:1d -label:Digest-Processed';
  var threads = GmailApp.search(query, 0, 10);

  if (threads.length === 0) {
    Logger.log('No new digest emails found');
    return;
  }

  // Get the most recent thread
  var thread = threads[0];
  var messages = thread.getMessages();
  var message = messages[messages.length - 1];

  var body = message.getPlainBody();
  if (!body || body.trim().length === 0) {
    body = stripHtml(message.getBody());
  }

  if (!body || body.trim().length === 0) {
    Logger.log('Email body is empty, skipping');
    return;
  }

  var subject = message.getSubject();
  var date = message.getDate().toISOString();

  var payload = {
    event_type: 'new-digest',
    client_payload: {
      email_content: body,
      email_subject: subject,
      email_date: date
    }
  };

  var url = 'https://api.github.com/repos/' + repo + '/dispatches';
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github.v3+json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();

  if (code >= 200 && code < 300) {
    Logger.log('Successfully triggered GitHub Action');
    var label = createLabelIfNeeded();
    thread.addLabel(label);
    Logger.log('Labeled email as Digest-Processed');
  } else {
    Logger.log('GitHub API failed with status ' + code + ': ' + response.getContentText());
    // Don't label — will retry next hour
  }
}

function createLabelIfNeeded() {
  var label = GmailApp.getUserLabelByName('Digest-Processed');
  if (!label) {
    label = GmailApp.createLabel('Digest-Processed');
  }
  return label;
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
