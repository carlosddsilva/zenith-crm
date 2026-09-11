const fs = require('fs');

function patchEn() {
  let content = fs.readFileSync('messages/en.json', 'utf8');
  if (!content.includes('"zenithCalls": "Zenith Calls"')) {
    content = content.replace(
      '"aiAgents":  "AI Agents",',
      '"aiAgents":  "AI Agents",\n                    "zenithCalls": "Zenith Calls",'
    );
    content = content.replace(
      '"automations":  "Automations",',
      '"automations":  "Automations",\n                   "zenithCalls": "Zenith Calls",'
    );
    fs.writeFileSync('messages/en.json', content, 'utf8');
  }
}

function patchKo() {
  let content = fs.readFileSync('messages/ko.json', 'utf8');
  if (!content.includes('"zenithCalls": "Zenith Calls"')) {
    content = content.replace(
      /("aiAgents":\s*".*?",)/,
      '$1\n                    "zenithCalls": "Zenith Calls",'
    );
    content = content.replace(
      /("automations":\s*".*?",)/,
      '$1\n                   "zenithCalls": "Zenith Calls",'
    );
    fs.writeFileSync('messages/ko.json', content, 'utf8');
  }
}

patchEn();
patchKo();
