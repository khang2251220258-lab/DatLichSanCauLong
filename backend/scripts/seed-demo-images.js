import 'dotenv/config';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { prisma } from '../src/config/prisma.js';
import { createImageStorage } from '../src/modules/facilities/presentation/storage.js';

const CONFIRMATION='BOOKING_DEVELOPMENT_ONLY', PREFIX='facility-images/demo-gallery-v2';
const OWNER_EMAIL='demo.owner@booking.invalid';
// Names are the stable demo identity. IDs are deliberately absent: PostgreSQL
// sequences and older seed generations must not decide which rows receive media.
const FACILITIES=[
 {key:'legacy-song-han',name:'Demo Cầu Lông Sông Hàn',count:3},
 {key:'legacy-hoa-xuan',name:'Demo Cầu Lông Hòa Xuân',count:2},
 {key:'legacy-hoi-an',name:'Demo Cầu Lông Hội An',count:2},
 {key:'legacy-demo-hoa-xuan',name:'DEMO Sân Hòa Xuân',count:2},
 {key:'full-song-han',name:'Demo - Cau long Song Han',count:3},
 {key:'full-hoa-xuan',name:'Demo - Trung tam the thao Hoa Xuan',count:2},
 {key:'full-hoi-an',name:'Demo - Cau long Pho Co Hoi An',count:2},
 {key:'full-bien-xanh',name:'Demo - San cau long Bien Xanh voi ten dai de kiem tra bo cuc quan ly',count:4},
 {key:'full-ngu-hanh-son',name:'Demo - Cau long Ngu Hanh Son',count:4},
 {key:'full-hoa-vang',name:'Demo - Cau long Hoa Vang',count:2},
 {key:'full-draft',name:'Demo - Co so dang soan thao',count:1},
 {key:'full-pending',name:'Demo - Co so cho duyet',count:1},
 {key:'full-rejected',name:'Demo - Co so bi tu choi',count:1},
 {key:'full-suspended',name:'Demo - Co so tam ngung',count:1},
];
export const SOURCES=[
 {file:'SBA Badminton Hall.jpg',page:'https://commons.wikimedia.org/wiki/File:SBA_Badminton_Hall.jpg',author:'Vano111ru',license:'CC BY-SA 4.0'},
 {file:'Indoor badminton court.jpg',page:'https://commons.wikimedia.org/wiki/File:Indoor_badminton_court.jpg',author:'Alanands3',license:'CC BY-SA 4.0'},
 {file:'Overhead view of indoor badminton courts and skylight atrium at Universiti Malaya Cyberjaya (250423).jpg',page:'https://commons.wikimedia.org/wiki/File:Overhead_view_of_indoor_badminton_courts_and_skylight_atrium_at_Universiti_Malaya_Cyberjaya_(250423).jpg',author:'angys',license:'CC BY-SA 4.0'},
 {file:'Paroi Badminton Courts.jpg',page:'https://commons.wikimedia.org/wiki/File:Paroi_Badminton_Courts.jpg',author:'PulauKakatua19',license:'CC BY-SA 3.0'},
 {file:'AFMC Badminton Court.png',page:'https://commons.wikimedia.org/wiki/File:AFMC_Badminton_Court.png',author:'AFMC Official',license:'CC BY 4.0'},
 {file:'Badminton Court at IITD.jpg',page:'https://commons.wikimedia.org/wiki/File:Badminton_Court_at_IITD.jpg',author:'Ruturajpol',license:'CC BY-SA 4.0'},
 {file:'Badminton court view.jpg',page:'https://commons.wikimedia.org/wiki/File:Badminton_court_view.jpg',author:'Darakshanehaluddin',license:'CC0'},
 {file:'Badminton Court at IIT Kharagpur.jpg',page:'https://commons.wikimedia.org/wiki/File:Badminton_Court_at_IIT_Kharagpur.jpg',author:'AnushkaG2509',license:'CC BY-SA 4.0'},
 {file:'Badminton courts.jpg',page:'https://commons.wikimedia.org/wiki/File:Badminton_courts.jpg',author:'Wengh',license:'CC BY-SA 4.0'},
 {file:'Kai Yuet Court Badminton Court.jpg',page:'https://commons.wikimedia.org/wiki/File:Kai_Yuet_Court_Badminton_Court.jpg',author:'Knowledge Era',license:'CC BY-SA 4.0'},
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CURATED_SOURCE_INDEXES=[1,6,5,7];
const sourceBuffers=new Map;
function fingerprint(){const u=new URL(process.env.DATABASE_URL||'');return createHash('sha256').update(`${u.protocol}//${u.hostname}:${u.port||'default'}${u.pathname}`).digest('hex').slice(0,16)}
function guard(){if(process.env.NODE_ENV!=='development')throw Error('NODE_ENV_MUST_BE_DEVELOPMENT');if(process.env.DEMO_SEED_CONFIRM!==CONFIRMATION)throw Error('DEMO_SEED_CONFIRM_REQUIRED');if(process.env.DEMO_SEED_TARGET_FINGERPRINT!==fingerprint())throw Error('DEMO_SEED_TARGET_FINGERPRINT_MISMATCH')}
async function facilities(){
 const rows=await prisma.facility.findMany({
  where:{name:{in:FACILITIES.map(x=>x.name)},owner:{user:{email_normalized:OWNER_EMAIL}}},
  include:{images:{orderBy:[{sort_order:'asc'},{id:'asc'}]},_count:{select:{courts:true}}},
 });
 if(rows.length!==FACILITIES.length)throw Error('MANAGED_FACILITIES_NOT_READY');
 return FACILITIES.map(spec=>{const matches=rows.filter(x=>x.name===spec.name);if(matches.length!==1)throw Error(`MANAGED_FACILITY_IDENTITY_CONFLICT:${spec.key}`);return{spec,row:matches[0]}});
}
async function download(source){const url=`https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(source.file)}?width=1800`;const response=await fetch(url,{headers:{'User-Agent':'BOOKING-SanTheThao-demo-seed/1.0 (academic project)'}});if(!response.ok)throw Error(`IMAGE_SOURCE_HTTP_${response.status}`);const raw=Buffer.from(await response.arrayBuffer());return sharp(raw,{failOn:'warning'}).rotate().resize(1600,1000,{fit:'cover',position:'attention'}).webp({quality:82,effort:5}).toBuffer()}
async function curatedBuffer(index){const sourceIndex=CURATED_SOURCE_INDEXES[index%CURATED_SOURCE_INDEXES.length];if(!sourceBuffers.has(sourceIndex))sourceBuffers.set(sourceIndex,await download(SOURCES[sourceIndex]));return sourceBuffers.get(sourceIndex)}
async function invariant(){const [bookings,slots,locks,proofs,refunds]=await Promise.all([prisma.booking.count(),prisma.bookingSlot.count(),prisma.courtSlotLock.count(),prisma.paymentProof.count(),prisma.refund.count()]);return{bookings,slots,locks,proofs,refunds}}
async function report(){const entries=await facilities();return{coverage:entries.filter(x=>x.row.images.length>0).length,total_images:entries.reduce((n,x)=>n+x.row.images.length,0),facilities:entries.map(({spec,row})=>({key:spec.key,id:String(row.id),name:row.name,images:row.images.length,courts:row._count.courts,public_ids:row.images.map(i=>i.image_path)}))}}
async function main(){guard();const before=await invariant(),rows=await facilities();if(process.argv.includes('--verify')){const result=await report();if(result.facilities.some(x=>x.images!==FACILITIES.find(f=>f.key===x.key).count||x.public_ids.some((id,i)=>id!==`${PREFIX}/${x.key}-${String(i+1).padStart(2,'0')}`)))throw Error('DEMO_IMAGE_QUALITY_SET_NOT_READY');console.log(JSON.stringify({mode:'VERIFY_IMAGES',fingerprint:fingerprint(),report:result,booking_data:before}));return}const storage=createImageStorage();storage.ready();let uploaded=0,replaced=0;
 for(const{spec,row:facility}of rows){
  const desired=Array.from({length:spec.count},(_,index)=>`${PREFIX}/${spec.key}-${String(index+1).padStart(2,'0')}`);
  if(facility.images.length===desired.length&&facility.images.every((image,index)=>image.image_path===desired[index]&&image.sort_order===index))continue;
  const newlyUploaded=[];
  try{
   for(let index=0;index<desired.length;index++){
    const publicId=desired[index],probe=await fetch(storage.url(publicId),{method:'HEAD'});
    if(probe.ok)continue;
    await sleep(350);const buffer=await curatedBuffer(index);if(buffer.length>5_000_000)throw Error('OPTIMIZED_IMAGE_TOO_LARGE');await storage.upload(buffer,publicId);newlyUploaded.push(publicId);uploaded++;
   }
   const oldPaths=facility.images.map(x=>x.image_path);
   await prisma.$transaction(async tx=>{await tx.facilityImage.deleteMany({where:{facility_id:facility.id}});for(let index=0;index<desired.length;index++)await tx.facilityImage.create({data:{facility_id:facility.id,image_path:desired[index],sort_order:index,created_at:new Date()}})});
   replaced+=oldPaths.length;
   for(const oldPath of oldPaths)if(!desired.includes(oldPath)&&!await prisma.facilityImage.count({where:{image_path:oldPath}}))try{await storage.destroy(oldPath)}catch(error){console.error(`DEMO IMAGE CLEANUP FAILED: ${oldPath} (${error?.code||'STORAGE_ERROR'})`)}
  }catch(error){for(const publicId of newlyUploaded)if(!await prisma.facilityImage.count({where:{image_path:publicId}}))try{await storage.destroy(publicId)}catch{}throw error}
 }
 const after=await invariant();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('BOOKING_PAYMENT_DATA_CHANGED');console.log(JSON.stringify({mode:'SEEDED_IMAGES',fingerprint:fingerprint(),uploaded,replaced,report:await report(),booking_data:after}))}
try{await main()}catch(error){console.error(`DEMO IMAGE SEED FAILED: ${error?.message||'UNKNOWN_ERROR'}`);process.exitCode=1}finally{await prisma.$disconnect()}
