from pathlib import Path
p=Path('app.js')
s=p.read_text(encoding='utf-8')
old="function searchMatches(product,query){const haystack=normalizeSearch(catalogSearchText(product));if(!query)return true;const words=haystack.split(' ');const forms=[normalizeSearch(query),normalizeSearch(swappedKeyboardLayout(query))].filter(Boolean);return forms.some(form=>{if(haystack.includes(form))return true;return form.split(' ').every(token=>{if(token.length<2)return words.some(word=>word.startsWith(token));const tolerance=token.length>=7?2:1;return words.some(word=>word.includes(token)||(word.length>=4&&distanceAtMost(word,token,tolerance)))});})}"
new="function isDistinctFurnitureToken(token=''){return /^стул/iu.test(token)||/^стол/iu.test(token)}\nfunction searchMatches(product,query){const haystack=normalizeSearch(catalogSearchText(product));if(!query)return true;const words=haystack.split(' ');const forms=[normalizeSearch(query),normalizeSearch(swappedKeyboardLayout(query))].filter(Boolean);return forms.some(form=>{if(haystack.includes(form))return true;return form.split(' ').every(token=>{if(token.length<2)return words.some(word=>word.startsWith(token));if(isDistinctFurnitureToken(token))return words.some(word=>word.startsWith(token));const tolerance=token.length>=7?2:1;return words.some(word=>word.includes(token)||(word.length>=4&&distanceAtMost(word,token,tolerance)))});})}"
if old not in s:
    raise SystemExit('searchMatches pattern not found')
p.write_text(s.replace(old,new,1),encoding='utf-8')
