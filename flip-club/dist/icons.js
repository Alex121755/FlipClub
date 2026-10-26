// Original, self-contained card illustrations. All drawings share a 64 px canvas.
const C = { orange:'#ed714b', green:'#447262', purple:'#6963ad', gold:'#d8ad4c', light:'#f2e8cb', pink:'#dd8a91', blue:'#79a5b1', ink:'#315c50' };
const drawings = [
  ['叶子', `<path fill="${C.green}" d="M49 12c5 24-5 40-22 39-13-1-17-13-10-23 6-9 17-10 32-16Z"/><path d="M14 54 43 22M27 41l-4-11m10 5 10 1"/>`],
  ['星星', `<path fill="${C.gold}" d="m32 8 7.5 15.3 17 2.5-12.3 12 2.9 16.9L32 46.7l-15.1 8 2.9-16.9-12.3-12 17-2.5Z"/>`],
  ['月亮', `<path fill="${C.purple}" d="M42 10a23 23 0 1 0 12 33C31 47 20 25 42 10Z"/><path stroke="${C.gold}" d="m48 14 1.5 4.5L54 20l-4.5 1.5L48 26l-1.5-4.5L42 20l4.5-1.5Z" fill="${C.gold}"/>`],
  ['樱桃', `<path d="M22 39c1-16 7-20 13-29 0 16 4 20 9 28"/><path fill="${C.green}" d="M35 11c10-4 15-1 17 5-9 2-14 0-17-5Z"/><circle fill="${C.orange}" cx="20" cy="43" r="11"/><circle fill="${C.pink}" cx="44" cy="44" r="11"/><path stroke="#fff3e8" d="m16 39 2-2m22 3 2-2"/>`],
  ['蘑菇', `<path fill="${C.light}" d="m26 32-4 20c5 4 15 4 20 0l-4-20Z"/><path fill="${C.orange}" d="M9 33C10 18 20 10 32 10s22 8 23 23c-12 5-34 5-46 0Z"/><circle fill="${C.light}" stroke="none" cx="23" cy="23" r="4"/><circle fill="${C.light}" stroke="none" cx="39" cy="19" r="3"/><circle fill="${C.light}" stroke="none" cx="45" cy="29" r="3"/>`],
  ['花朵', `<path stroke="${C.green}" d="M32 38v17m0-6c-9 1-13-3-13-9 8-1 12 3 13 9Z" fill="${C.green}"/><path fill="${C.pink}" d="M26 19c-9-15 18-15 12 0 16-8 20 17 4 15 5 16-20 20-20 4-16 5-20-20-4-20 2-8 6-7 8 1Z"/><circle fill="${C.gold}" cx="32" cy="28" r="8"/>`],
  ['梨子', `<path d="M32 18c0-7 3-10 7-12"/><path fill="${C.green}" d="M32 15c-10-1-13-5-12-9 8-1 12 3 12 9Z"/><path fill="${C.gold}" d="M25 21c2-8 13-8 15 0 1 6 1 11 7 17 12 15-17 24-28 12-10-11 5-16 6-29Z"/><path stroke="#fbefcf" d="M24 37c-5 7-3 10 0 12"/>`],
  ['小鱼', `<path fill="${C.blue}" d="M45 24c-12-16-30-8-37 8 7 16 25 24 37 8l12 9V15Z"/><path fill="${C.gold}" d="m25 16 10-7 3 12m-13 27 10 7 3-12"/><circle fill="${C.ink}" stroke="none" cx="19" cy="30" r="2.5"/><path d="M33 24c-5 4-5 12 0 16M9 34h6"/>`],
  ['蝴蝶', `<path fill="${C.purple}" d="M30 30C13-1 0 20 13 34c-17 17 7 29 17 4m4-8C51-1 64 20 51 34c17 17-7 29-17 4"/><path fill="${C.pink}" stroke="none" d="M24 29c-11-13-13-4-6 2Zm16 0c11-13 13-4 6 2Z"/><path d="M32 23v24m-1-23-6-7m8 7 6-7"/><path fill="${C.gold}" d="M29 29c0-5 6-5 6 0v15c0 5-6 5-6 0Z"/>`],
  ['贝壳', `<path fill="${C.pink}" d="M29 52 10 29C1 16 16 9 23 16c0-14 18-14 18 0 7-7 22 0 13 13L35 52Z"/><path d="m32 47-9-28m9 28 9-28M27 47 13 26m24 21 14-21"/><path fill="${C.light}" d="M25 48h14v7H25Z"/>`],
  ['咖啡', `<path fill="${C.light}" d="M14 27h32v16c0 16-32 16-32 0Z"/><path d="M46 29h4c13 0 10 16-4 15M9 56h43"/><path stroke="${C.orange}" d="M23 20c-7-7 7-7 0-14m12 14c-7-7 7-7 0-14"/>`],
  ['行星', `<circle fill="${C.purple}" cx="32" cy="32" r="18"/><path stroke="${C.gold}" stroke-width="6" d="M16 23C-9 32 5 49 35 39 63 30 66 15 48 18"/><path fill="none" stroke="${C.ink}" d="M16 23C-9 32 5 49 35 39 63 30 66 15 48 18"/><path stroke="#b5a6d5" d="m30 19 7 2m3 25-7 1"/>`],
  ['钻石', `<path fill="${C.blue}" d="m17 12 30 0 12 16-27 28L5 28Z"/><path fill="#a9c6cc" d="m17 12 15 44 15-44m-42 16h54M17 12l15 16 15-16"/>`],
  ['闪电', `<path fill="${C.gold}" d="M36 6 12 35h17l-3 23 26-32H35Z"/>`],
  ['太阳', `<circle fill="${C.orange}" cx="32" cy="32" r="14"/><path stroke="${C.gold}" stroke-width="3.5" d="M32 5v7m0 40v7M5 32h7m40 0h7M13 13l5 5m28 28 5 5M13 51l5-5m28-28 5-5"/>`],
  ['爱心', `<path fill="${C.pink}" d="M32 54C4 37 3 26 10 17c7-8 17-5 22 3 5-8 15-11 22-3 7 9 6 20-22 37Z"/><path stroke="#fce5dd" d="M17 22c-4 1-5 5-4 8"/>`],
  ['四叶草', `<path fill="${C.green}" d="M30 30C9 36 5 17 17 14 14 2 34 7 32 28 30 7 49 2 48 14c12 3 8 22-14 18 22-4 26 15 14 18 1 12-18 7-16-14 2 21-18 26-15 14C5 47 9 28 30 30Z"/><path d="m32 33 4 24"/>`],
  ['柠檬', `<path fill="${C.gold}" d="M13 43c-7-2-9-9-3-12 2-18 25-28 38-12 7 1 9 8 4 12-3 17-24 27-39 12Z"/><path stroke="#fff0b7" d="M19 26c4-6 11-9 17-7"/><path fill="${C.green}" d="M47 16c-1-9 5-13 12-10 0 8-4 12-12 10Z"/>`],
  ['草莓', `<path fill="${C.orange}" d="M14 23c-12 9 7 33 18 34 11-1 30-25 18-34-9-7-28-7-36 0Z"/><path fill="${C.green}" d="m32 23-15-7 10-1 5-9 5 9 10 1Z"/><g stroke="${C.light}" stroke-width="3"><path d="m21 29 1 2m19-2-1 2m-9-1 1 2m-5 8 1 2m10-2-1 2m-5 6 1 2"/></g>`],
  ['橡果', `<path fill="${C.gold}" d="M17 28c0 20 8 24 15 29 7-5 15-9 15-29Z"/><path fill="${C.green}" d="M13 30c-1-21 39-21 38 0Z"/><path d="M32 14c0-6 2-9 7-10M19 23l5 6m3-9 8 9m3-9 7 9"/>`],
  ['松树', `<path fill="${C.gold}" d="M28 43h8v14h-8Z"/><path fill="${C.green}" d="M32 6 17 25h7L12 39h8L8 51h48L44 39h8L40 25h7Z"/>`],
  ['山峰', `<path fill="${C.purple}" d="m5 52 20-33 11 18L47 24l14 28Z"/><path fill="${C.blue}" d="m13 52 23-41 23 41Z"/><path fill="${C.light}" d="m27 27 9-16 9 16-8-3-4 7Z"/>`],
  ['雨伞', `<path d="M32 30v20c0 10 13 10 13 0M32 7v5"/><path fill="${C.orange}" d="M7 34C8 5 56 5 57 34c-7-7-11-7-17 0-6-7-10-7-16 0-6-7-10-7-17 0Z"/><path d="M32 12c-5 5-8 13-8 22m8-22c5 5 8 13 8 22"/>`],
  ['钥匙', `<path fill="${C.gold}" fill-rule="evenodd" d="M27 10a15 15 0 1 0 2 25l14 14 6-6 6 6 5-5-26-26A15 15 0 0 0 27 10ZM17 19a5 5 0 1 1 7 7 5 5 0 0 1-7-7Z"/>`],
  ['礼物', `<path fill="${C.orange}" d="M12 28h40v28H12Z"/><path fill="${C.pink}" d="M8 20h48v11H8Z"/><path fill="${C.gold}" d="M28 20h8v36h-8Z"/><path fill="${C.gold}" d="M31 20C5 21 14-4 26 8l6 12c26 1 17-24 5-12Z"/>`],
  ['风筝', `<path fill="${C.gold}" d="M30 7 50 26 30 47 10 26Z"/><path fill="${C.orange}" d="m30 7 20 19H30Zm0 19v21L10 26Z"/><path d="M30 7v40M10 26h40m-20 21c16 2-8 8 6 13"/><path fill="${C.purple}" d="m31 51 8-2-1 8Z"/>`],
  ['蜗牛', `<path fill="${C.gold}" d="M10 45c-5 3-5 10 3 10h34c9 0 13-10 8-15-4-4-10-1-12 5Z"/><path d="m49 39-1-10m6 12 5-8"/><circle fill="${C.ink}" cx="48" cy="28" r="2"/><circle fill="${C.ink}" cx="59" cy="32" r="2"/><circle fill="${C.orange}" cx="27" cy="32" r="18"/><path d="M36 34c4-14-18-16-19-3-1 10 15 14 16 3 1-6-8-8-8-2"/>`],
  ['蜡烛', `<path fill="${C.purple}" d="M22 28h20v27H22Z"/><path fill="${C.pink}" d="M22 28h20v11c-2 5-7 5-7 0v-3c-3 4-7 3-7-1v-2c-2 3-4 2-6 1Z"/><path fill="${C.gold}" d="M32 6c13 13 10 20 0 20-10 0-13-7 0-20Z"/><path d="M32 23v5M16 56h32"/>`],
  ['西瓜', `<path fill="${C.green}" d="M5 23c0 42 54 42 54 0Z"/><path fill="${C.pink}" d="M11 23c0 34 42 34 42 0Z"/><g fill="${C.ink}" stroke="none"><ellipse cx="21" cy="32" rx="2" ry="3" transform="rotate(-30 21 32)"/><ellipse cx="43" cy="32" rx="2" ry="3" transform="rotate(30 43 32)"/><ellipse cx="32" cy="40" rx="2" ry="3"/></g>`],
  ['云朵', `<path fill="${C.blue}" d="M16 45C0 44 3 25 16 26c-1-20 27-24 32-6 17-2 22 25 3 25Z"/><path stroke="${C.purple}" d="m20 51-3 7m16-7-3 7m16-7-3 7"/>`],
  ['火箭', `<path fill="${C.orange}" d="M25 41c-10 2-13 7-13 14l13-5m16-9c10 2 13 7 13 14l-13-5"/><path fill="${C.light}" d="M32 5C14 20 19 34 25 46h14c6-12 11-26-7-41Z"/><path fill="${C.gold}" d="M28 47h8l-4 13Z"/><circle fill="${C.blue}" cx="32" cy="25" r="7"/><path d="M23 38h18"/>`],
  ['彩虹', `<path fill="none" stroke="${C.orange}" stroke-width="9" d="M9 49V34a23 23 0 0 1 46 0v15"/><path fill="none" stroke="${C.gold}" stroke-width="8" d="M17 49V34a15 15 0 0 1 30 0v15"/><path fill="none" stroke="${C.green}" stroke-width="7" d="M25 49V34a7 7 0 0 1 14 0v15"/><path stroke="${C.ink}" d="M5 50h23m8 0h23"/>`]
  ,['书本', `<path fill="${C.light}" d="M32 17C23 10 14 10 6 13v37c9-3 17-2 26 4 9-6 17-7 26-4V13c-8-3-17-3-26 4Z"/><path d="M32 17v37M13 21c4-1 8 0 12 2m-12 7c4-1 8 0 12 2m14-9c4-2 8-3 12-2m-12 11c4-2 8-3 12-2"/>`],
  ['铅笔', `<path fill="${C.gold}" d="m12 42 30-30 10 10-30 30-16 6Z"/><path fill="${C.pink}" d="m42 12 5-5c6-6 16 4 10 10l-5 5Z"/><path fill="${C.light}" d="m12 42 10 10-16 6Z"/><path fill="${C.ink}" d="m8 52 4 4-6 2Z"/><path d="m18 46 29-29M39 15l10 10"/>`],
  ['剪刀', `<circle fill="${C.orange}" cx="16" cy="47" r="9"/><circle fill="${C.gold}" cx="47" cy="47" r="9"/><path fill="${C.blue}" d="m22 40 8-12L45 7c5 10-3 24-11 32l-4 5Zm20 0L34 28 19 7c-5 10 3 24 11 32l4 5Z"/><circle fill="${C.light}" cx="32" cy="34" r="3"/>`],
  ['相机', `<path fill="${C.green}" d="M8 19h12l4-7h16l4 7h12v34H8Z"/><path fill="${C.gold}" d="M43 23h8v6h-8Z"/><circle fill="${C.light}" cx="30" cy="36" r="12"/><circle fill="${C.blue}" cx="30" cy="36" r="7"/><path stroke="#f7f0dc" d="m28 33 3-2"/>`],
  ['音符', `<path fill="${C.purple}" d="M26 11v32c0 13-24 15-23 3 1-8 10-11 17-8V15Zm0 0 31-6v11l-31 6Z"/><path fill="${C.purple}" d="M57 11v27c0 13-24 15-23 3 1-8 10-11 17-8V16Z"/>`],
  ['小鼓', `<path fill="${C.orange}" d="M10 25h44v25c-5 10-39 10-44 0Z"/><path fill="${C.gold}" d="m10 28 11 22 11-22 11 22 11-22"/><ellipse fill="${C.light}" cx="32" cy="25" rx="22" ry="7"/><path d="m14 6 30 15M50 5 25 21"/><circle fill="${C.gold}" cx="12" cy="5" r="3"/><circle fill="${C.gold}" cx="52" cy="4" r="3"/>`],
  ['喇叭', `<path fill="${C.gold}" d="M8 28h24c10 0 15-9 24-13v34c-9-4-14-13-24-13H8Z"/><path fill="${C.gold}" d="M17 36v10c0 12 22 12 22 0V34h-8v12c0 4-6 4-6 0V36Z"/><path d="M16 20v8m9-8v8m9-8v8M12 20h8m1 0h8m1 0h8M56 12v40"/>`],
  ['铃铛', `<path fill="${C.gold}" d="M10 46c7-6 7-12 7-20 0-20 30-20 30 0 0 8 0 14 7 20Z"/><path fill="${C.orange}" d="M24 47c0 13 16 13 16 0Z"/><path d="M28 10c0-7 8-7 8 0M20 39h24"/>`],
  ['船锚', `<circle fill="${C.gold}" cx="32" cy="11" r="6"/><path stroke="${C.blue}" stroke-width="6" d="M32 18v36M21 27h22M10 36c0 22 44 22 44 0"/><path d="m5 40 5-8 7 6m30 0 7-6 5 8M32 18v36M21 27h22"/>`],
  ['帆船', `<path fill="${C.orange}" d="M7 42h50L47 55H17Z"/><path d="M32 7v35"/><path fill="${C.light}" d="M28 9v28H8Z"/><path fill="${C.blue}" d="M36 17v20h18Z"/><path stroke="${C.blue}" d="M8 60c5-5 11 5 16 0s11 5 16 0 11 5 16 0"/>`],
  ['雪花', `<g stroke="${C.blue}" stroke-width="3"><path d="M32 7v50M10 19l44 26M10 45l44-26"/><path d="m25 11 7 7 7-7m-14 42 7-7 7 7M10 27l9-3-1-9m28 34-1-9 9-3M10 37l9 3-1 9m28-34-1 9 9 3"/></g>`],
  ['皇冠', `<path fill="${C.gold}" d="m9 17 13 12L32 12l10 17 13-12-6 34H15Z"/><path fill="${C.orange}" d="M15 44h34v10H15Z"/><circle fill="${C.purple}" cx="32" cy="36" r="4"/><circle fill="${C.gold}" cx="8" cy="15" r="3"/><circle fill="${C.gold}" cx="32" cy="10" r="3"/><circle fill="${C.gold}" cx="56" cy="15" r="3"/>`],
  ['气球', `<path d="M32 43c-12 8 13 10 0 18"/><path fill="${C.pink}" d="M32 44C0 26 17 0 32 5c15-5 32 21 0 39Z"/><path fill="${C.orange}" d="m32 42-5 7h10Z"/><path stroke="#fbe3d9" d="M22 13c-5 3-6 9-4 13"/>`],
  ['骰子', `<rect fill="${C.light}" x="10" y="10" width="44" height="44" rx="9"/><g fill="${C.purple}" stroke="none"><circle cx="21" cy="21" r="4"/><circle cx="43" cy="21" r="4"/><circle cx="32" cy="32" r="4"/><circle cx="21" cy="43" r="4"/><circle cx="43" cy="43" r="4"/></g>`],
  ['时钟', `<circle fill="${C.gold}" cx="32" cy="32" r="25"/><circle fill="${C.light}" cx="32" cy="32" r="20"/><path d="M32 18v14l10 6M32 14v2m18 16h-2M32 50v-2M14 32h2"/><circle fill="${C.orange}" cx="32" cy="32" r="2"/>`],
  ['指南针', `<circle fill="${C.light}" cx="32" cy="34" r="23"/><path d="M28 11V7c0-5 8-5 8 0v4"/><path fill="${C.orange}" d="m42 19-6 19-14 11 6-19Z"/><path fill="${C.blue}" d="m28 30 8 8-14 11Z"/><circle fill="${C.gold}" cx="32" cy="34" r="3"/><path d="M32 15v3m0 32v3M13 34h3m32 0h3"/>`],
  ['眼镜', `<circle fill="${C.blue}" cx="17" cy="36" r="11"/><circle fill="${C.blue}" cx="47" cy="36" r="11"/><path d="M28 34c2-4 6-4 8 0M6 34l3-17h9m40 17-3-17h-9"/><path stroke="#d2e4dd" d="m12 33 4-3m26 3 4-3"/>`],
  ['魔法帽', `<path fill="${C.purple}" d="M16 45 30 6l7 12 6-3-1 13 8 17Z"/><ellipse fill="${C.purple}" cx="32" cy="48" rx="27" ry="8"/><path fill="${C.gold}" d="m19 37 27-2 3 8-33 2Z"/><path fill="${C.gold}" stroke="none" d="m31 19 2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1Z"/>`],
  ['运动鞋', `<path fill="${C.orange}" d="M8 20h14l8 15 22 5c7 2 10 13 2 15H10c-5 0-5-5-4-9Z"/><path fill="${C.light}" d="M6 46h52v9H10c-5 0-5-5-4-9Z"/><path d="m22 28 7-4m-3 12 7-5m0 10 7-6M13 25v12"/>`],
  ['袜子', `<path fill="${C.blue}" d="M25 7h24v31c0 9-14 22-24 22H13C0 58 7 43 20 42l5-5Z"/><path fill="${C.light}" d="M25 7h24v10H25Z"/><path fill="${C.purple}" d="M8 49c7-4 12 1 12 11h-7C5 59 4 54 8 49Zm30-8c2-8 7-10 11-10v7c0 6-4 11-8 15Z"/>`],
  ['灯笼', `<path d="M32 3v8m0 42v8m-6-6v5m12-5v5"/><path fill="${C.orange}" d="M20 14h24c20 10 18 27 0 37H20C2 41 0 24 20 14Z"/><path d="M25 14c-9 10-9 27 0 37m14-37c9 10 9 27 0 37M8 32h48"/><path fill="${C.gold}" d="M20 10h24v7H20Zm0 39h24v6H20Z"/>`],
  ['篮子', `<path d="M17 29v-8c0-21 30-21 30 0v8"/><path fill="${C.gold}" d="M7 27h50L49 55H15Z"/><path fill="${C.orange}" d="M5 23h54v8H5Z"/><path d="m20 35 3 15m9-15v15m12-15-3 15M12 42h40"/>`],
  ['玻璃瓶', `<path fill="${C.blue}" d="M25 12h14v13c0 6 10 7 10 17v14H15V42c0-10 10-11 10-17Z"/><path fill="${C.green}" d="M15 42h34v14H15Z"/><path fill="${C.gold}" d="M24 6h16v9H24Z"/><path fill="${C.light}" d="M23 37h18v12H23Z"/><path d="M29 43h6"/>`],
  ['茶壶', `<path fill="${C.gold}" d="M17 27c-15-11-22 11-4 15m37-15c3-2 6-8 6-12l5 4c1 14-2 22-12 25"/><path fill="${C.orange}" d="M16 24h31c14 39-43 39-31 0Z"/><path fill="${C.gold}" d="M14 21c8-12 28-12 35 0Z"/><path d="M29 13V8h8v5M21 47h20"/>`],
  ['汤匙', `<path fill="${C.blue}" d="M36 30C50 22 51 8 44 5c-9-5-22 8-19 19 1 4 4 6 6 7L10 52c-7 7 2 13 7 6Z"/><path stroke="#d1e1db" d="M33 20c0-4 4-9 7-9"/>`],
  ['叉子', `<path fill="${C.gold}" d="M15 6v17c0 7 4 11 11 12l-3 23h10l-3-23c7-1 11-5 11-12V6h-6v16h-4V6h-6v16h-4V6Z"/>`],
  ['胡萝卜', `<path fill="${C.green}" d="M39 20c-2-12 5-19 10-17 2 5-1 11-6 17 11-8 17-6 17-1-4 7-10 8-17 6Z"/><path fill="${C.orange}" d="M37 19c8-2 16 7 10 15C37 47 18 56 6 59c4-15 16-34 31-40Z"/><path d="m29 28 7 7m-16 3 5 5m-12 4 3 3"/>`],
  ['玉米', `<path fill="${C.gold}" d="M20 40V19c0-22 24-22 24 0v21Z"/><path d="M28 10v27m8-27v27M20 18h24M20 26h24M20 34h24"/><path fill="${C.green}" d="M33 57C7 51 6 35 9 23c15 6 20 19 24 34Zm0 0c-7-17 4-31 23-34-1 19-9 30-23 34Z"/><path d="M15 32c9 9 12 18 18 25m0 0c3-11 9-19 17-25"/>`],
  ['茄子', `<path fill="${C.purple}" d="M40 19c30 13 3 42-22 39C0 55 4 46 15 42c13-5 4-15 15-22Z"/><path fill="${C.green}" d="m26 19 10-4 6-12 6 3-7 12 8 7-11-2-3 9-4-9-11 1Z"/><path stroke="#b7aad6" d="M17 48c9-1 16-6 19-11"/>`],
  ['南瓜', `<path d="M31 16c0-10 4-12 10-12l-2 7c-3 0-4 2-3 5"/><ellipse fill="${C.orange}" cx="22" cy="36" rx="16" ry="21"/><ellipse fill="${C.orange}" cx="42" cy="36" rx="16" ry="21"/><ellipse fill="${C.gold}" cx="32" cy="36" rx="12" ry="21"/><path d="M32 18v36"/>`],
  ['桃子', `<path fill="${C.pink}" d="M32 22C4 3-4 44 32 58 68 44 60 3 32 22Z"/><path d="M32 22c8 13 8 22 0 36"/><path fill="${C.green}" d="M32 18C30 4 44 2 53 8c-4 10-12 14-21 10Z"/><path stroke="#fae1d1" d="M18 28c-5 3-5 9-3 13"/>`],
  ['椰子', `<circle fill="${C.gold}" cx="31" cy="36" r="23"/><ellipse fill="${C.light}" cx="33" cy="24" rx="20" ry="15" transform="rotate(-18 33 24)"/><ellipse fill="${C.blue}" cx="33" cy="24" rx="12" ry="8" transform="rotate(-18 33 24)"/><path stroke="${C.orange}" stroke-width="4" d="m36 23 5-20h11"/><path d="m14 40 4 6m2 4 5 3m23-14-3 9"/>`],
  ['仙人掌', `<path fill="${C.green}" d="M26 46V15c0-14 14-14 14 0v13h4v-9c0-9 10-9 10 0v11c0 8-5 11-14 11v5Zm0-9H18C8 37 7 30 7 26v-7c0-9 10-9 10 0v6h9Z"/><path fill="${C.orange}" d="M21 44h24l-4 15H25Z"/><path d="M32 14v3m1 10v3m0 9v3M11 22h2m35 0h2"/>`],
  ['海龟', `<path fill="${C.green}" d="m18 19-7-9-7 4 10 14m31-8 7-10 7 4-9 15M16 43l-6 11 7 3 9-11m15-3 6 11 7-3-7-12"/><ellipse fill="${C.green}" cx="55" cy="34" rx="7" ry="9"/><path fill="${C.green}" d="m9 34-7 3 8 4"/><ellipse fill="${C.gold}" cx="31" cy="33" rx="22" ry="18"/><path d="m25 23 12 0 7 10-7 10H25l-7-10ZM25 23l-4-7m16 7 4-7M44 33h9M18 33H9m16 10-4 7m16-7 4 7"/><circle fill="${C.ink}" stroke="none" cx="57" cy="32" r="1.5"/>`],
  ['鲸鱼', `<path fill="${C.blue}" d="M47 32C41 9 2 19 6 40c4 20 41 18 48-2l5-11c-7-1-10 2-12 5Z"/><path fill="${C.light}" d="M9 42c8 5 21 6 30 1-5 12-24 14-30-1Z"/><path fill="${C.blue}" d="m33 37 8 13c-9 2-14-4-15-9"/><path d="M20 15V7m0 5c-7 0-9-3-9-7m9 7c7 0 9-3 9-7"/><circle fill="${C.ink}" stroke="none" cx="15" cy="33" r="2"/>`],
  ['螃蟹', `<path stroke="${C.orange}" stroke-width="4" d="m15 37-9 5m10 2-9 8m15-5-5 11m32-21 9 5m-10 2 9 8m-15-5 5 11M19 33 9 23m36 10 10-10"/><path fill="${C.orange}" d="M10 26C-2 23 0 10 8 8l1 10 8-7c6 9 2 14-7 15Zm44 0c12-3 10-16 2-18l-1 10-8-7c-6 9-2 14 7 15Z"/><ellipse fill="${C.orange}" cx="32" cy="38" rx="20" ry="13"/><path d="M24 28v-8m16 8v-8m-14 21c3 4 9 4 12 0"/><circle fill="${C.light}" cx="24" cy="19" r="4"/><circle fill="${C.light}" cx="40" cy="19" r="4"/><circle fill="${C.ink}" stroke="none" cx="24" cy="19" r="1.5"/><circle fill="${C.ink}" stroke="none" cx="40" cy="19" r="1.5"/>`],
  ['蜜蜂', `<ellipse fill="${C.light}" cx="24" cy="18" rx="10" ry="14" transform="rotate(-35 24 18)"/><ellipse fill="${C.light}" cx="39" cy="17" rx="10" ry="14" transform="rotate(35 39 17)"/><ellipse fill="${C.gold}" cx="32" cy="36" rx="22" ry="17"/><path fill="${C.ink}" d="M24 21h7v30h-7Zm14 0h7v30h-7Z" stroke="none"/><path fill="${C.gold}" d="m53 34 8 3-8 3Z"/><path d="m16 25-4-9m8 8 1-11"/><circle fill="${C.ink}" stroke="none" cx="16" cy="33" r="2"/>`],
  ['小猫', `<path fill="${C.orange}" d="m12 27 1-21 18 14h2L51 6l1 21c15 33-55 33-40 0Z"/><path fill="${C.pink}" d="m17 22 1-8 8 7m12 0 8-7 1 8" stroke="none"/><path d="M22 32v3m20-3v3M32 41v4m0 0c-3 4-6 3-8 1m8-1c3 4 6 3 8 1M7 35l10 3M6 43h10m41-8-10 3m11 5H48"/><path fill="${C.pink}" d="m28 39 4 4 4-4Z"/>`],
  ['兔子', `<path fill="${C.light}" d="M18 30C-2-4 26-8 27 25h10C38-8 66-4 46 30c19 29-47 29-28 0Z"/><path stroke="${C.pink}" stroke-width="4" d="M18 10c0 5 3 12 5 15m23-15c0 5-3 12-5 15"/><path d="M23 37v3m18-3v3m-9 6v4m0 0-4 2m4-2 4 2"/><path fill="${C.pink}" d="m28 44 4 4 4-4Z"/>`],
  ['小鸭', `<path fill="${C.gold}" d="M32 34c-16-5-22 1-28-3 0 28 46 31 51 9 5-19-1-32-12-32-14 0-16 19-9 25Z"/><path fill="${C.orange}" d="m52 20 10 5-11 6Z"/><path d="M18 40c6 10 16 10 23 1"/><circle fill="${C.ink}" stroke="none" cx="44" cy="20" r="2.5"/>`]
];

export function symbol(value) {
  const index = ((Math.trunc(Number(value)) || 0) % drawings.length + drawings.length) % drawings.length;
  return `<svg viewBox="0 0 64 64" fill="none" stroke="${C.ink}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[index][1]}</svg>`;
}

export function symbolName(value) {
  const index = ((Math.trunc(Number(value)) || 0) % drawings.length + drawings.length) % drawings.length;
  return drawings[index][0];
}

const ui = {
  sound: '<path d="m11 5-6 4H2v6h3l6 4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  soundOff: '<path d="m11 5-6 4H2v6h3l6 4Z"/><path d="m16 9 6 6m0-6-6 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.4 1.6c-1.2.8-1.9 1.2-1.9 2.9m0 3h.01"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  refresh: '<path d="M20 8a8.5 8.5 0 1 0 .3 7M20 3v5h-5"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M7 5h3v14H7Zm7 0h3v14h-3Z"/>',
  close: '<path d="m6 6 12 12m0-12L6 18"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  swap: '<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/>',
  double: '<path d="M8 7h8v14H4V7Zm0-4h12v14"/><path d="m8 12 4 4m0-4-4 4"/>',
  check: '<path d="m5 12 4.5 4.5L20 6"/>',
  bot: '<rect x="4" y="7" width="16" height="13" rx="4"/><path d="M12 3v4M1 12v4m22-4v4m-15-4v2m8-2v2m-7 3h6"/><circle cx="12" cy="2.5" r=".5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 5a3.5 3.5 0 0 1 0 7m3 2a5 5 0 0 1 3 4v3"/>',
  trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3c0 3 2 5 5 5m9-8h4v3c0 3-2 5-5 5M12 14v5m-4 2h8m-8-2h8"/>',
  settings: '<path d="m10 3-1 3-3 1-3 3 2 2-1 3 3 3 3-1 2 3 3-1 1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-3Z"/><circle cx="12" cy="12" r="3"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>'
};

export function icon(name, size = 20) {
  const safeSize = Math.max(1, Math.min(512, Number(size) || 20));
  return `<svg width="${safeSize}" height="${safeSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ui[name] || ui.help}</svg>`;
}
