import { googleFetch } from './google-auth';

const G = 'https://www.googleapis.com';

// ===================== GMAIL =====================

export async function gmailListMessages(query?: string, maxResults = 10): Promise<string> {
  const q = encodeURIComponent(query || 'is:inbox');
  const list = await googleFetch(`${G}/gmail/v1/users/me/messages?q=${q}&maxResults=${maxResults}`);
  if (!list.messages || list.messages.length === 0) {
    return query ? `📭 לא נמצאו מיילים עבור: "${query}"` : '📭 תיבת הדואר ריקה.';
  }

  const details = await Promise.all(
    list.messages.slice(0, maxResults).map(async (msg: any) => {
      const d = await googleFetch(`${G}/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
      const headers = d.payload?.headers || [];
      const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
      const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(ללא נושא)';
      const date = headers.find((h: any) => h.name === 'Date')?.value || '';
      const snippet = d.snippet || '';
      const isUnread = d.labelIds?.includes('UNREAD');
      return `${isUnread ? '🔵' : '📩'} **${subject}**\nמאת: ${from}\n${snippet.slice(0, 100)}${snippet.length > 100 ? '...' : ''}\n📅 ${date}\nID: ${msg.id}`;
    })
  );
  return details.join('\n\n---\n\n');
}

export async function gmailReadMessage(messageId: string): Promise<string> {
  const d = await googleFetch(`${G}/gmail/v1/users/me/messages/${messageId}?format=full`);
  const headers = d.payload?.headers || [];
  const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
  const to = headers.find((h: any) => h.name === 'To')?.value || '';
  const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(ללא נושא)';
  const date = headers.find((h: any) => h.name === 'Date')?.value || '';

  let body = '';
  const payload = d.payload;
  if (payload?.body?.data) {
    body = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  } else if (payload?.parts) {
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
    const part = textPart || htmlPart;
    if (part?.body?.data) {
      body = Buffer.from(part.body.data, 'base64url').toString('utf-8');
    }
  }
  body = body.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (body.length > 2000) body = body.slice(0, 2000) + '\n\n... (נחתך)';

  return `📧 **${subject}**\nמאת: ${from}\nאל: ${to}\n📅 ${date}\n\n${body}`;
}

export async function gmailSend(to: string, subject: string, body: string): Promise<string> {
  const message = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n');
  const raw = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await googleFetch(`${G}/gmail/v1/users/me/messages/send`, {
    method: 'POST',
    body: JSON.stringify({ raw }),
  });
  return `✅ מייל נשלח ל-${to}: "${subject}"`;
}

export async function gmailSearch(query: string): Promise<string> {
  return gmailListMessages(query, 10);
}

export async function gmailMarkRead(messageId: string): Promise<string> {
  await googleFetch(`${G}/gmail/v1/users/me/messages/${messageId}/modify`, {
    method: 'POST',
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  });
  return `✅ הודעה ${messageId} סומנה כנקראה.`;
}

// ===================== GOOGLE DRIVE =====================

export async function driveListFiles(query?: string, maxResults = 15): Promise<string> {
  let q = 'trashed = false';
  if (query) q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
  const params = new URLSearchParams({
    q,
    pageSize: String(maxResults),
    fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
    orderBy: 'modifiedTime desc',
  });
  const res = await googleFetch(`${G}/drive/v3/files?${params}`);
  if (!res.files || res.files.length === 0) {
    return query ? `📂 לא נמצאו קבצים עבור: "${query}"` : '📂 Drive ריק.';
  }
  return res.files.map((f: any) => {
    const size = f.size ? `${(Number(f.size) / 1024 / 1024).toFixed(1)}MB` : '';
    const date = f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('he-IL') : '';
    const icon = f.mimeType?.includes('folder') ? '📁' : f.mimeType?.includes('document') ? '📄' : f.mimeType?.includes('spreadsheet') ? '📊' : f.mimeType?.includes('image') ? '🖼️' : '📎';
    return `${icon} **${f.name}** ${size ? `(${size})` : ''}\n   ${date} · [פתח](${f.webViewLink || '#'})\n   ID: ${f.id}`;
  }).join('\n\n');
}

export async function driveSearch(query: string): Promise<string> {
  return driveListFiles(query, 15);
}

export async function driveGetFile(fileId: string): Promise<string> {
  const f = await googleFetch(`${G}/drive/v3/files/${fileId}?fields=id,name,mimeType,size,modifiedTime,webViewLink,shared`);
  const size = f.size ? `${(Number(f.size) / 1024 / 1024).toFixed(2)}MB` : 'N/A';

  let content = '';
  if (f.mimeType?.includes('document') || f.mimeType?.includes('spreadsheet')) {
    try {
      const res = await googleFetch(`${G}/drive/v3/files/${fileId}/export?mimeType=text/plain`, {
        headers: { Accept: 'text/plain' },
      });
      content = typeof res === 'string' ? res.slice(0, 3000) : '';
    } catch {}
  }

  return `📄 **${f.name}**\nסוג: ${f.mimeType}\nגודל: ${size}\nעודכן: ${f.modifiedTime ? new Date(f.modifiedTime).toLocaleString('he-IL') : 'N/A'}\nשיתוף: ${f.shared ? 'כן' : 'לא'}\nלינק: ${f.webViewLink || 'N/A'}${content ? `\n\n--- תוכן ---\n${content}` : ''}`;
}

export async function driveCreateFile(name: string, content: string, mimeType?: string, folderId?: string): Promise<string> {
  const isDoc = mimeType === 'application/vnd.google-apps.document';
  const isSheet = mimeType === 'application/vnd.google-apps.spreadsheet';
  const metadata: any = { name };
  if (folderId) metadata.parents = [folderId];
  if (isDoc) metadata.mimeType = 'application/vnd.google-apps.document';
  if (isSheet) metadata.mimeType = 'application/vnd.google-apps.spreadsheet';

  const boundary = '----GoogleDriveBoundary';
  const uploadMime = isDoc ? 'text/plain' : isSheet ? 'text/csv' : (mimeType || 'text/plain');
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${uploadMime}\r\n\r\n${content}\r\n--${boundary}--`;

  const res = await googleFetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  return `✅ קובץ נוצר: **${res.name}**\nלינק: ${res.webViewLink || 'N/A'}\nID: ${res.id}`;
}

export async function driveShareFile(fileId: string, email: string, role = 'reader'): Promise<string> {
  await googleFetch(`${G}/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    body: JSON.stringify({ type: 'user', role, emailAddress: email }),
  });
  return `✅ הקובץ שותף עם ${email} (${role})`;
}

// ===================== GOOGLE TASKS =====================

export async function tasksListAll(maxResults = 20): Promise<string> {
  const listsRes = await googleFetch(`${G}/tasks/v1/users/@me/lists?maxResults=10`);
  const lists = listsRes.items || [];
  if (lists.length === 0) return '📋 אין רשימות משימות.';

  const results: string[] = [];
  for (const list of lists) {
    const tasksRes = await googleFetch(`${G}/tasks/v1/lists/${list.id}/tasks?maxResults=${maxResults}&showCompleted=false`);
    const items = tasksRes.items || [];
    if (items.length === 0) continue;
    results.push(`📋 **${list.title}** (${items.length} משימות)`);
    for (const item of items) {
      const due = item.due ? ` · 📅 ${new Date(item.due).toLocaleDateString('he-IL')}` : '';
      results.push(`  ⬜ ${item.title}${due}\n     ID: ${item.id} (list: ${list.id})`);
    }
  }
  return results.length > 0 ? results.join('\n') : '📋 אין משימות פתוחות.';
}

export async function tasksAdd(title: string, notes?: string, dueDate?: string, tasklistId?: string): Promise<string> {
  let listId = tasklistId;
  if (!listId) {
    const listsRes = await googleFetch(`${G}/tasks/v1/users/@me/lists?maxResults=1`);
    listId = listsRes.items?.[0]?.id || '@default';
  }
  const taskBody: any = { title };
  if (notes) taskBody.notes = notes;
  if (dueDate) taskBody.due = new Date(dueDate).toISOString();

  const res = await googleFetch(`${G}/tasks/v1/lists/${listId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(taskBody),
  });
  return `✅ משימה נוצרה: **${res.title}**${dueDate ? ` (עד ${new Date(dueDate).toLocaleDateString('he-IL')})` : ''}\nID: ${res.id}`;
}

export async function tasksComplete(taskId: string, tasklistId?: string): Promise<string> {
  let listId = tasklistId;
  if (!listId) {
    const listsRes = await googleFetch(`${G}/tasks/v1/users/@me/lists?maxResults=1`);
    listId = listsRes.items?.[0]?.id || '@default';
  }
  await googleFetch(`${G}/tasks/v1/lists/${listId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed' }),
  });
  return `✅ משימה הושלמה!`;
}

export async function tasksDelete(taskId: string, tasklistId?: string): Promise<string> {
  let listId = tasklistId;
  if (!listId) {
    const listsRes = await googleFetch(`${G}/tasks/v1/users/@me/lists?maxResults=1`);
    listId = listsRes.items?.[0]?.id || '@default';
  }
  await googleFetch(`${G}/tasks/v1/lists/${listId}/tasks/${taskId}`, { method: 'DELETE' });
  return `🗑️ משימה נמחקה.`;
}

// ===================== GOOGLE CALENDAR =====================

export async function gcalListEvents(days = 3, maxResults = 15): Promise<string> {
  const now = new Date();
  const end = new Date(now.getTime() + days * 86400000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime',
  });
  const res = await googleFetch(`${G}/calendar/v3/calendars/primary/events?${params}`);
  const events = res.items || [];
  if (events.length === 0) return `📅 אין אירועים ב-${days} הימים הקרובים.`;

  return events.map((e: any) => {
    const start = e.start?.dateTime || e.start?.date || '';
    const startDate = new Date(start);
    const time = e.start?.dateTime
      ? startDate.toLocaleString('he-IL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : startDate.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' }) + ' (כל היום)';
    const location = e.location ? ` 📍 ${e.location}` : '';
    return `📅 **${e.summary || 'ללא כותרת'}**\n   ${time}${location}\n   ID: ${e.id}`;
  }).join('\n\n');
}

export async function gcalAddEvent(title: string, startTime: string, endTime?: string, location?: string, description?: string): Promise<string> {
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date(start.getTime() + 3600000);
  const event: any = {
    summary: title,
    start: { dateTime: start.toISOString(), timeZone: 'Asia/Jerusalem' },
    end: { dateTime: end.toISOString(), timeZone: 'Asia/Jerusalem' },
  };
  if (location) event.location = location;
  if (description) event.description = description;

  const res = await googleFetch(`${G}/calendar/v3/calendars/primary/events`, {
    method: 'POST',
    body: JSON.stringify(event),
  });
  const dateStr = start.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = start.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `✅ אירוע נוצר: **${title}**\n${dateStr} ${timeStr}${location ? ` ב${location}` : ''}\nלינק: ${res.htmlLink || 'N/A'}`;
}

export async function gcalDeleteEvent(eventId: string): Promise<string> {
  await googleFetch(`${G}/calendar/v3/calendars/primary/events/${eventId}`, { method: 'DELETE' });
  return `🗑️ אירוע נמחק.`;
}

// ===================== GOOGLE CONTACTS =====================

export async function contactsList(query?: string, maxResults = 20): Promise<string> {
  if (query) {
    const res = await googleFetch(`https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(query)}&readMask=names,emailAddresses,phoneNumbers&pageSize=${maxResults}`);
    const contacts = res.results || [];
    if (contacts.length === 0) return `👤 לא נמצאו אנשי קשר עבור: "${query}"`;
    return contacts.map((c: any) => {
      const p = c.person;
      const name = p?.names?.[0]?.displayName || 'ללא שם';
      const email = p?.emailAddresses?.[0]?.value || '';
      const phone = p?.phoneNumbers?.[0]?.value || '';
      return `👤 **${name}**${email ? `\n   📧 ${email}` : ''}${phone ? `\n   📱 ${phone}` : ''}`;
    }).join('\n\n');
  }

  const res = await googleFetch(`https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=${maxResults}&sortOrder=LAST_MODIFIED_DESCENDING`);
  const contacts = res.connections || [];
  if (contacts.length === 0) return '👤 אין אנשי קשר.';
  return contacts.map((c: any) => {
    const name = c.names?.[0]?.displayName || 'ללא שם';
    const email = c.emailAddresses?.[0]?.value || '';
    const phone = c.phoneNumbers?.[0]?.value || '';
    return `👤 **${name}**${email ? `\n   📧 ${email}` : ''}${phone ? `\n   📱 ${phone}` : ''}`;
  }).join('\n\n');
}
