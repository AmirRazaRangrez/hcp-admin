export const c={ink:'#21181f',brass:'#8c5d77',blush:'#fbd3e4',highlight:'#c7a3b8',bg:'#fcf9fb',card:'#FFFFFF',line:'#f2e6ee',text:'#21181f',mute:'#75636f',ok:'#16a34a',bad:'#dc2626',warn:'#dc2626'};
const inr=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0});
export const money=(n:any)=>inr.format(Number(n)||0);
export const when=(s?:string)=>s?new Date(String(s).replace(' ','T')).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'-';
