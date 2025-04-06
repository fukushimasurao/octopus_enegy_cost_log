// ==== メイン関数 ====
function main() {
  // pushテスト
  const token = getOctopusToken();
  const accountNumber = getAccountNumber(token);
  const readings = getUsage(token, accountNumber);
  const { totalKWh, estimatedCost } = calculateTotals(readings);

  const jstDate = getYesterdayJST();
  writeToSheet(jstDate, totalKWh, estimatedCost);
  sendLineViaMessagingAPI(jstDate, totalKWh, estimatedCost);
}

// ==== データ書き込み（上書き or 追記） ====
function writeToSheet(date, kWh, yen) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const formattedDate = Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');

  const lastRow = sheet.getLastRow();
  let targetRow = null;

  if (lastRow >= 1) {
    const dateValues = sheet.getRange(1, 1, lastRow, 1).getValues();
    for (let i = 0; i < dateValues.length; i++) {
      const cell = dateValues[i][0];
      if (!cell) continue;
      const existingDate = Utilities.formatDate(new Date(cell), 'Asia/Tokyo', 'yyyy-MM-dd');
      if (existingDate === formattedDate) {
        targetRow = i + 1;
        break;
      }
    }
  }

  if (targetRow) {
    sheet.getRange(targetRow, 1, 1, 3).setValues([[formattedDate, kWh, yen]]);
  } else {
    sheet.appendRow([formattedDate, kWh, yen]);
  }
}

// ==== LINE通知（月次集計付き） ====
function sendLineViaMessagingAPI(date, kWh, yen) {
  const formattedDate = Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');

  const { startDate, endDate } = getBillingRange(date);
  const { totalKWh, totalCost } = getMonthlySummary(startDate, endDate);

  const message =
    `✅ ${formattedDate} の合計電力使用量: ${kWh} kWh\n` +
    `💰 推定電気料金: ${yen} 円\n` +
    `📊 月次集計（${formatJST(startDate)}〜${formatJST(endDate)}）\n` +
    `🔌 合計使用量: ${totalKWh} kWh\n` +
    `💰 合計金額: ${totalCost} 円`;

  const url = 'https://api.line.me/v2/bot/message/push';
  const payload = {
    to: CONFIG.LINE_USER_ID,
    messages: [{ type: 'text', text: message }]
  };

  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + CONFIG.LINE_CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// ==== 月次範囲を求める ====
function getBillingRange(date) {
  const d = new Date(date);
  const day = d.getDate();

  let start, end;
  if (day >= 23) {
    start = new Date(d.getFullYear(), d.getMonth(), 23);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 22);
  } else {
    start = new Date(d.getFullYear(), d.getMonth() - 1, 23);
    end = new Date(d.getFullYear(), d.getMonth(), 22);
  }

  return { startDate: start, endDate: end };
}

// ==== 月次集計（スプレッドシート読み込み） ====
function getMonthlySummary(startDate, endDate) {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const records = sheet.getRange(1, 1, lastRow, 3).getValues();

  let totalKWh = 0;
  let totalCost = 0;

  records.forEach(row => {
    const rowDate = new Date(row[0]);
    if (rowDate >= startDate && rowDate <= endDate) {
      totalKWh += parseFloat(row[1]) || 0;
      totalCost += parseFloat(row[2]) || 0;
    }
  });

  return {
    totalKWh: parseFloat(totalKWh.toFixed(1)),
    totalCost: parseFloat(totalCost.toFixed(2))
  };
}

// ==== フォーマット補助 ====
function formatJST(date) {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy/MM/dd');
}

// ==== 日付処理 ====
function getYesterdayJST() {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getTodayJST() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// ==== Octopus 認証 & データ取得 ====
function getOctopusToken() {
  const payload = {
    query: `
      mutation obtainKrakenToken($input: ObtainJSONWebTokenInput!) {
        obtainKrakenToken(input: $input) {
          token
        }
      }`,
    variables: {
      input: {
        email: CONFIG.OCTOPUS_EMAIL,
        password: CONFIG.OCTOPUS_PASSWORD
      }
    }
  };

  const response = UrlFetchApp.fetch('https://api.oejp-kraken.energy/v1/graphql/', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  });

  const json = JSON.parse(response.getContentText());
  return json.data.obtainKrakenToken.token;
}

function getAccountNumber(token) {
  const payload = {
    query: `
      query accountViewer {
        viewer {
          accounts {
            number
          }
        }
      }`
  };

  const response = UrlFetchApp.fetch('https://api.oejp-kraken.energy/v1/graphql/', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'JWT ' + token
    },
    payload: JSON.stringify(payload)
  });

  const json = JSON.parse(response.getContentText());
  return json.data.viewer.accounts[0].number;
}

function getUsage(token, accountNumber) {
  const from = new Date(getYesterdayJST().getTime() - 9 * 60 * 60 * 1000);
  const to = new Date(getTodayJST().getTime() - 9 * 60 * 60 * 1000);
  const fromISO = from.toISOString();
  const toISO = new Date(to.getTime() - 1000).toISOString();

  const payload = {
    query: `
      query halfHourlyReadings($accountNumber: String!, $fromDatetime: DateTime, $toDatetime: DateTime) {
        account(accountNumber: $accountNumber) {
          properties {
            electricitySupplyPoints {
              halfHourlyReadings(fromDatetime: $fromDatetime, toDatetime: $toDatetime) {
                startAt
                value
              }
            }
          }
        }
      }`,
    variables: {
      accountNumber,
      fromDatetime: fromISO,
      toDatetime: toISO
    }
  };

  const response = UrlFetchApp.fetch('https://api.oejp-kraken.energy/v1/graphql/', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'JWT ' + token
    },
    payload: JSON.stringify(payload)
  });

  const json = JSON.parse(response.getContentText());
  return json.data.account.properties[0].electricitySupplyPoints[0].halfHourlyReadings;
}

// ==== 合計と金額計算 ====
function calculateTotals(readings) {
  let total = 0;
  readings.forEach(r => total += parseFloat(r.value));

  let energyCost = 0;
  if (total <= 120) {
    energyCost = total * 20.62;
  } else if (total <= 300) {
    energyCost = 120 * 20.62 + (total - 120) * 25.29;
  } else {
    energyCost = 120 * 20.62 + 180 * 25.29 + (total - 300) * 27.44;
  }

  const totalCost = Math.round((energyCost + 29.1) * 100) / 100;
  return {
    totalKWh: parseFloat(total.toFixed(2)),
    estimatedCost: totalCost
  };
}