/**
 * Google Apps Script — checks Gmail for AI Digest emails
 * and triggers GitHub Actions workflow.
 *
 * Looks for two types of emails:
 * 1. Perplexity Computer email: subject contains "AI Digest", body is JSON
 * 2. Perplexity Tasks notification: from perplexity, plain text summary
 *
 * Setup:
 * 1. Paste this into script.google.com
 * 2. Add Script Properties:
 *    - GITHUB_TOKEN: GitHub fine-grained PAT with Contents read/write
 *    - GITHUB_REPO: username/repo-name
 * 3. Create hourly time-based trigger for checkForDigest
 * 4. Run checkForDigest once manually to grant Gmail permissions
 */

function checkForDigest() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('GITHUB_TOKEN');
  var repo = props.getProperty('GITHUB_REPO');

  if (!token || !repo) {
    Logger.log('Missing GITHUB_TOKEN or GITHUB_REPO in Script Properties');
    return;
  }

  // Priority 1: Look for Perplexity Computer email with pre-formatted JSON
  var computerQuery = 'subject:"AI Digest" newer_than:1d -label:Digest-Processed';
  var threads = GmailApp.search(computerQuery, 0, 10);

  // Priority 2: Fall back to Perplexity Tasks notification
  if (threads.length === 0) {
    var sender = props.getProperty('SENDER_FILTER') || 'perplexity';
    var tasksQuery = 'from:' + sender + ' newer_than:1d -label:Digest-Processed';
    threads = GmailApp.search(tasksQuery, 0, 10);
  }

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

  // Check if the body is pre-formatted JSON (from Perplexity Computer)
  var isJson = false;
  try {
    var trimmed = body.trim();
    if (trimmed.charAt(0) === '{') {
      JSON.parse(trimmed);
      isJson = true;
    }
  } catch(e) {}

  var subject = message.getSubject();
  var date = message.getDate().toISOString();

  var payload = {
    event_type: 'new-digest',
    client_payload: {
      email_content: body,
      email_subject: subject,
      email_date: date,
      is_preformatted: isJson ? 'true' : 'false'
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
    Logger.log('Successfully triggered GitHub Action (json=' + isJson + ')');
    var label = createLabelIfNeeded();
    thread.addLabel(label);
    Logger.log('Labeled email as Digest-Processed');
  } else {
    Logger.log('GitHub API failed with status ' + code + ': ' + response.getContentText());
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
