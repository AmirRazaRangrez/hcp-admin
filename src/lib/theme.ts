export const c={ink:'#0F2A2E',brass:'#B8893B',bg:'#F4F5F2',card:'#FFFFFF',line:'#E1E4DE',text:'#16211F',mute:'#6B7773',ok:'#2E7D5B',bad:'#B3402F',warn:'#C77D12'};
const inr=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0});
export const money=(n:any)=>inr.format(Number(n)||0);
export const when=(s?:string)=>s?new Date(String(s).replace(' ','T')).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'-';
