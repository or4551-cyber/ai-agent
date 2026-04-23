import { google } from 'googleapis';
import { getOAuth2Client, isAuthenticated } from './google-auth';

function requireAuth() {
  if (!isAuthenticated()) {
    throw new Error('Google לא מחובר. השתמש בכתובת /api/google/auth בדפדפן כדי להתחבר.');
  }
  return getOAuth2Client()!;
}

// ===================== GMAIL =====================

export async function gmailListMessages(query?: string, maxResults = 10): Promise<string> {
  const auth = requireAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query || 'is:inbox',
    maxResults,
  });

  if (!res.data.messages || res.data.messages.length === 0) {
    return query ? `📭 לא נמצאו מיילים עבור: "${query}"` : '📭 תיבת הדואר ריקה.';
  }

  const details = await Promise.all(
    res.data.messages.slice(0, maxResults).map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });
      const headers = detail.data.payload?.headers || [];
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const subject = headers.find(h => h.name === 'Subject')?.value || '(ללא נושא)';
      const date = headers.find(h => h.name === 'Date')?.value || '';
      const snippet = detail.data.snippet || '';
      const isUnread = detail.data.labelIds?.includes('UNREAD');
      return `${isUnread ? '🔵' : '📩'} **${subject}**\nמאת: ${from}\n${snippet.slice(0, 100)}${snippet.length > 100 ? '...' : ''}\n📅 ${date}\nID: ${msg.id}`;
    })
  );

  return details.join('\n\n---\n\n');
}

export async function gmailReadMessage(messageId: string): Promise<string> {
  const auth = requireAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  const detail = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = detail.data.payload?.headers || [];
  const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
  const to = headers.find(h => h.name === 'To')?.value || '';
  const subject = headers.find(h => h.name === 'Subject')?.value || '(ללא נושא)';
  const date = headers.find(h => h.name === 'Date')?.value || '';

  // Extract body
  let body = '';
  const payload = detail.data.payload;
  if (payload?.body?.data) {
    body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
  } else if (payload?.parts) {
    const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
    const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
    const part = textPart || htmlPart;
    if (part?.body?.data) {
      body = Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
  }

  // Strip HTML tags if needed
  body = body.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (body.length > 2000) body = body.slice(0, 2000) + '\n\n... (נחתך — הודעה ארוכה)';

  return `📧 **${subject}**\nמאת: ${from}\nאל: ${to}\n📅 ${date}\n\n${body}`;
}

export async function gmailSend(to: string, subject: string, body: string): Promise<string> {
  const auth = requireAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  const message = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n');

  const encoded = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  });

  return `✅ מייל נשלח ל-${to}: "${subject}"`;
}

export async function gmailSearch(query: string): Promise<string> {
  return gmailListMessages(query, 10);
}

export async function gmailMarkRead(messageId: string): Promise<string> {
  const auth = requireAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });

  return `✅ הודעה ${messageId} סומנה כנקראה.`;
}

// ===================== GOOGLE DRIVE =====================

export async function driveListFiles(query?: string, maxResults = 15): Promise<string> {
  const auth = requireAuth();
  const drive = google.drive({ version: 'v3', auth });

  let q = 'trashed = false';
  if (query) q += ` and name contains '${query.replace(/'/g, "\\'")}'`;

  const res = await drive.files.list({
    q,
    pageSize: maxResults,
    fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, owners)',
    orderBy: 'modifiedTime desc',
  });

  if (!res.data.files || res.data.files.length === 0) {
    return query ? `📂 לא נמצאו קבצים עבור: "${query}"` : '📂 Drive ריק.';
  }

  return res.data.files.map(f => {
    const size = f.size ? `${(Number(f.size) / 1024 / 1024).toFixed(1)}MB` : '';
    const date = f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('he-IL') : '';
    const icon = f.mimeType?.includes('folder') ? '📁' :
                 f.mimeType?.includes('document') ? '📄' :
                 f.mimeType?.includes('spreadsheet') ? '📊' :
                 f.mimeType?.includes('presentation') ? '📽️' :
                 f.mimeType?.includes('image') ? '🖼️' :
                 f.mimeType?.includes('pdf') ? '📕' : '📎';
    return `${icon} **${f.name}** ${size ? `(${size})` : ''}\n   ${date} · [פתח](${f.webViewLink || '#'})\n   ID: ${f.id}`;
  }).join('\n\n');
}

export async function driveSearch(query: string): Promise<string> {
  return driveListFiles(query, 15);
}

export async function driveGetFile(fileId: string): Promise<string> {
  const auth = requireAuth();
  const drive = google.drive({ version: 'v3', auth });

  const meta = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, modifiedTime, webViewLink, description, owners, shared',
  });

  const f = meta.data;
  const size = f.size ? `${(Number(f.size) / 1024 / 1024).toFixed(2)}MB` : 'N/A';

  let content = '';
  // Try to export text content for Google Docs types
  if (f.mimeType?.includes('document') || f.mimeType?.includes('spreadsheet')) {
    try {
      const exported = await drive.files.export({
        fileId,
        mimeType: 'text/plain',
      });
      content = String(exported.data).slice(0, 3000);
      if (String(exported.data).length > 3000) content += '\n\n... (נחתך)';
    } catch {}
  }

  return `📄 **${f.name}**\nסוג: ${f.mimeType}\nגודל: ${size}\nעודכן: ${f.modifiedTime ? new Date(f.modifiedTime).toLocaleString('he-IL') : 'N/A'}\nשיתוף: ${f.shared ? 'כן' : 'לא'}\nלינק: ${f.webViewLink || 'N/A'}${content ? `\n\n--- תוכן ---\n${content}` : ''}`;
}

export async function driveCreateFile(name: string, content: string, mimeType?: string, folderId?: string): Promise<string> {
  const auth = requireAuth();
  const drive = google.drive({ version: 'v3', auth });

  const isDoc = mimeType === 'application/vnd.google-apps.document';
  const isSheet = mimeType === 'application/vnd.google-apps.spreadsheet';

  const fileMetadata: any = { name };
  if (folderId) fileMetadata.parents = [folderId];
  if (isDoc) fileMetadata.mimeType = 'application/vnd.google-apps.document';
  if (isSheet) fileMetadata.mimeType = 'application/vnd.google-apps.spreadsheet';

  const media = {
    mimeType: isDoc ? 'text/plain' : isSheet ? 'text/csv' : (mimeType || 'text/plain'),
    body: content,
  };

  const res = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, name, webViewLink',
  });

  return `✅ קובץ נוצר: **${res.data.name}**\nלינק: ${res.data.webViewLink || 'N/A'}\nID: ${res.data.id}`;
}

export async function driveShareFile(fileId: string, email: string, role = 'reader'): Promise<string> {
  const auth = requireAuth();
  const drive = google.drive({ version: 'v3', auth });

  await drive.permissions.create({
    fileId,
    requestBody: {
      type: 'user',
      role,
      emailAddress: email,
    },
  });

  return `✅ הקובץ שותף עם ${email} (${role})`;
}

// ===================== GOOGLE TASKS =====================

export async function tasksListAll(maxResults = 20): Promise<string> {
  const auth = requireAuth();
  const tasks = google.tasks({ version: 'v1', auth });

  // Get task lists
  const listsRes = await tasks.tasklists.list({ maxResults: 10 });
  const lists = listsRes.data.items || [];

  if (lists.length === 0) return '📋 אין רשימות משימות.';

  const results: string[] = [];

  for (const list of lists) {
    const tasksRes = await tasks.tasks.list({
      tasklist: list.id!,
      maxResults,
      showCompleted: false,
    });

    const items = tasksRes.data.items || [];
    if (items.length === 0) continue;

    results.push(`📋 **${list.title}** (${items.length} משימות)`);
    for (const item of items) {
      const due = item.due ? ` · 📅 ${new Date(item.due).toLocaleDateString('he-IL')}` : '';
      const status = item.status === 'completed' ? '✅' : '⬜';
      results.push(`  ${status} ${item.title}${due}\n     ID: ${item.id} (list: ${list.id})`);
    }
  }

  return results.length > 0 ? results.join('\n') : '📋 אין משימות פתוחות.';
}

export async function tasksAdd(title: string, notes?: string, dueDate?: string, tasklistId?: string): Promise<string> {
  const auth = requireAuth();
  const tasksApi = google.tasks({ version: 'v1', auth });

  // Get default task list if not specified
  let listId = tasklistId;
  if (!listId) {
    const listsRes = await tasksApi.tasklists.list({ maxResults: 1 });
    listId = listsRes.data.items?.[0]?.id || '@default';
  }

  const body: any = { title };
  if (notes) body.notes = notes;
  if (dueDate) body.due = new Date(dueDate).toISOString();

  const res = await tasksApi.tasks.insert({
    tasklist: listId,
    requestBody: body,
  });

  return `✅ משימה נוצרה: **${res.data.title}**${dueDate ? ` (עד ${new Date(dueDate).toLocaleDateString('he-IL')})` : ''}\nID: ${res.data.id}`;
}

export async function tasksComplete(taskId: string, tasklistId?: string): Promise<string> {
  const auth = requireAuth();
  const tasksApi = google.tasks({ version: 'v1', auth });

  let listId = tasklistId;
  if (!listId) {
    const listsRes = await tasksApi.tasklists.list({ maxResults: 1 });
    listId = listsRes.data.items?.[0]?.id || '@default';
  }

  await tasksApi.tasks.patch({
    tasklist: listId,
    task: taskId,
    requestBody: { status: 'completed' },
  });

  return `✅ משימה הושלמה!`;
}

export async function tasksDelete(taskId: string, tasklistId?: string): Promise<string> {
  const auth = requireAuth();
  const tasksApi = google.tasks({ version: 'v1', auth });

  let listId = tasklistId;
  if (!listId) {
    const listsRes = await tasksApi.tasklists.list({ maxResults: 1 });
    listId = listsRes.data.items?.[0]?.id || '@default';
  }

  await tasksApi.tasks.delete({
    tasklist: listId,
    task: taskId,
  });

  return `🗑️ משימה נמחקה.`;
}

// ===================== GOOGLE CALENDAR (via API) =====================

export async function gcalListEvents(days = 3, maxResults = 15): Promise<string> {
  const auth = requireAuth();
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items || [];
  if (events.length === 0) return `📅 אין אירועים ב-${days} הימים הקרובים.`;

  return events.map(e => {
    const start = e.start?.dateTime || e.start?.date || '';
    const startDate = new Date(start);
    const time = e.start?.dateTime
      ? startDate.toLocaleString('he-IL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : startDate.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' }) + ' (כל היום)';
    const location = e.location ? ` 📍 ${e.location}` : '';
    const desc = e.description ? `\n   ${e.description.slice(0, 100)}` : '';
    return `📅 **${e.summary || 'ללא כותרת'}**\n   ${time}${location}${desc}\n   ID: ${e.id}`;
  }).join('\n\n');
}

export async function gcalAddEvent(title: string, startTime: string, endTime?: string, location?: string, description?: string): Promise<string> {
  const auth = requireAuth();
  const calendar = google.calendar({ version: 'v3', auth });

  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date(start.getTime() + 60 * 60 * 1000);

  const event: any = {
    summary: title,
    start: { dateTime: start.toISOString(), timeZone: 'Asia/Jerusalem' },
    end: { dateTime: end.toISOString(), timeZone: 'Asia/Jerusalem' },
  };
  if (location) event.location = location;
  if (description) event.description = description;

  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event,
  });

  const dateStr = start.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = start.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

  return `✅ אירוע נוצר: **${title}**\n${dateStr} ${timeStr}${location ? ` ב${location}` : ''}\nלינק: ${res.data.htmlLink || 'N/A'}`;
}

export async function gcalDeleteEvent(eventId: string): Promise<string> {
  const auth = requireAuth();
  const calendar = google.calendar({ version: 'v3', auth });

  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
  });

  return `🗑️ אירוע נמחק.`;
}

// ===================== GOOGLE CONTACTS =====================

export async function contactsList(query?: string, maxResults = 20): Promise<string> {
  const auth = requireAuth();
  const people = google.people({ version: 'v1', auth });

  if (query) {
    const res = await people.people.searchContacts({
      query,
      readMask: 'names,emailAddresses,phoneNumbers',
      pageSize: maxResults,
    });
    const contacts = res.data.results || [];
    if (contacts.length === 0) return `👤 לא נמצאו אנשי קשר עבור: "${query}"`;
    return contacts.map(c => {
      const person = c.person;
      const name = person?.names?.[0]?.displayName || 'ללא שם';
      const email = person?.emailAddresses?.[0]?.value || '';
      const phone = person?.phoneNumbers?.[0]?.value || '';
      return `👤 **${name}**${email ? `\n   📧 ${email}` : ''}${phone ? `\n   📱 ${phone}` : ''}`;
    }).join('\n\n');
  }

  const res = await people.people.connections.list({
    resourceName: 'people/me',
    personFields: 'names,emailAddresses,phoneNumbers',
    pageSize: maxResults,
    sortOrder: 'LAST_MODIFIED_DESCENDING',
  });

  const contacts = res.data.connections || [];
  if (contacts.length === 0) return '👤 אין אנשי קשר.';

  return contacts.map(c => {
    const name = c.names?.[0]?.displayName || 'ללא שם';
    const email = c.emailAddresses?.[0]?.value || '';
    const phone = c.phoneNumbers?.[0]?.value || '';
    return `👤 **${name}**${email ? `\n   📧 ${email}` : ''}${phone ? `\n   📱 ${phone}` : ''}`;
  }).join('\n\n');
}
