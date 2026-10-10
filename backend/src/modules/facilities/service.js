import { AuthError } from '../auth/errors.js';
import { validateCore } from './validation.js';
import { supportedDistricts } from './districts.js';

const options = {maxWait:20000,timeout:20000};
const missing = () => new AuthError(404,'RESOURCE_NOT_FOUND','Không tìm thấy cơ sở.');
const conflict = () => new AuthError(409,'INVALID_FACILITY_STATE','Trạng thái cơ sở không cho phép thao tác này.');
const forbidden = () => new AuthError(403,'FORBIDDEN','Bạn không có quyền thực hiện thao tác này.');
const now = async tx => (await tx.$queryRaw`SELECT clock_timestamp() AS now`)[0].now;
const clock = value => value.getUTCSeconds() || value.getUTCMilliseconds() ? 'INVALID_TIME' : value.toISOString().slice(11,16);
const inputCore = row => ({...row,opening_time:clock(row.opening_time),closing_time:clock(row.closing_time)});
const dbCore = core => ({...core,...(core.opening_time ? {opening_time:new Date(`1970-01-01T${core.opening_time}:00.000Z`)} : {}),...(core.closing_time ? {closing_time:new Date(`1970-01-01T${core.closing_time}:00.000Z`)} : {})});
function present(row) {
  return {...row,id:String(row.id),owner_id:String(row.owner_id),reviewed_by:row.reviewed_by === null ? null : String(row.reviewed_by),
    latitude:row.latitude?.toString() ?? null,longitude:row.longitude?.toString() ?? null,opening_time:clock(row.opening_time),closing_time:clock(row.closing_time)};
}
async function actorCheck(tx, actor, admin) {
  const session = await tx.authSession.findUnique({where:{id:actor.id},include:{user:{include:{ownerProfile:true}}}});
  if (!session || session.user_id !== BigInt(actor.user.id) || session.revoked_at || session.expires_at <= await now(tx) || session.user.status !== 'ACTIVE') throw new AuthError(401,'SESSION_EXPIRED','Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  if (admin ? session.user.role !== 'ADMIN' : session.user.role !== 'CUSTOMER' || !session.user.ownerProfile) throw forbidden();
}
async function ownerCheck(tx, ownerId) {
  const user = await tx.user.findUnique({where:{id:ownerId},include:{ownerProfile:true}});
  if (!user || user.role !== 'CUSTOMER' || !user.ownerProfile || user.status !== 'ACTIVE') throw new AuthError(409,'FACILITY_OWNER_UNAVAILABLE','Chủ cơ sở không còn đủ điều kiện hoạt động.');
}
export function createFacilityService(db, districts = supportedDistricts) {
  async function mutate(actor, id, admin, operation) {
    const where = {id,...(admin ? {} : {owner_id:BigInt(actor.user.id)})};
    const target = await db.facility.findFirst({where,select:{owner_id:true}});
    if (!target) throw missing();
    return db.$transaction(async tx => {
      // User before Facility agrees with Owner approval/login lock order.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${target.owner_id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM facilities WHERE id = ${id} FOR UPDATE`;
      await actorCheck(tx,actor,admin);
      const row = await tx.facility.findFirst({where});
      if (!row || row.owner_id !== target.owner_id) throw missing();
      return present(await operation(tx,row));
    },options);
  }
  return {
    async create(actor, input) {
      return db.$transaction(async tx => {
        const owner_id = BigInt(actor.user.id);
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${owner_id} FOR UPDATE`;
        await actorCheck(tx,actor,false);
        const core = validateCore(input,districts);
        return present(await tx.facility.create({data:{...dbCore(core),owner_id,status:'DRAFT',created_at:await now(tx)}}));
      },options);
    },
    async list(actor, query, admin) {
      const where = {...(admin ? (query.owner_id ? {owner_id:query.owner_id} : {}) : {owner_id:BigInt(actor.user.id)}),...(query.status ? {status:query.status} : {})};
      const [rows,total] = await db.$transaction(async tx => Promise.all([
        tx.facility.findMany({where,orderBy:[{created_at:'desc'},{id:'desc'}],skip:(query.page-1)*query.page_size,take:query.page_size}),tx.facility.count({where}),
      ]),{...options,isolationLevel:'RepeatableRead'});
      return {items:rows.map(present),total};
    },
    async detail(actor,id,admin) {
      const row = await db.facility.findFirst({where:{id,...(admin ? {} : {owner_id:BigInt(actor.user.id)})},...(admin ? {include:{owner:{select:{user:{select:{id:true,full_name:true,email:true,phone:true,status:true}}}}}} : {})});
      if (!row) throw missing();
      const {owner,...facility} = row;
      return {...present(facility),...(admin ? {owner:{...owner.user,id:String(owner.user.id)}} : {})};
    },
    patch(actor,id,input) {
      return mutate(actor,id,false,async(tx,row)=>{
        if (!['DRAFT','REJECTED'].includes(row.status)) throw new AuthError(409,'FACILITY_EDIT_NOT_ALLOWED','Chỉ được sửa cơ sở Nháp hoặc Bị từ chối.');
        const core = validateCore({...inputCore(row),...input},districts);
        return tx.facility.update({where:{id},data:{...dbCore(core),status:'DRAFT',...(row.status === 'REJECTED' ? {submitted_at:null,reviewed_by:null,reviewed_at:null,rejection_reason:null} : {})}});
      });
    },
    transition(actor,id,action,reason) {
      const states = {submit:['DRAFT','PENDING'],approve:['PENDING','ACTIVE'],reject:['PENDING','REJECTED'],suspend:['ACTIVE','SUSPENDED'],activate:['SUSPENDED','ACTIVE']};
      return mutate(actor,id,action !== 'submit',async(tx,row)=>{
        if (!states[action] || row.status !== states[action][0]) throw conflict();
        if (['submit','approve','activate'].includes(action)) {
          await ownerCheck(tx,row.owner_id);
          validateCore(inputCore(row),districts);
        }
        const timestamp = await now(tx), data = {status:states[action][1]};
        if (action === 'submit') Object.assign(data,{submitted_at:timestamp,reviewed_by:null,reviewed_at:null,rejection_reason:null});
        if (action === 'approve' || action === 'reject') Object.assign(data,{reviewed_by:BigInt(actor.user.id),reviewed_at:timestamp,rejection_reason:action === 'reject' ? reason : null});
        if (action === 'suspend') Object.assign(data,{suspended_at:timestamp,suspension_reason:reason});
        if (action === 'activate') Object.assign(data,{suspended_at:null,suspension_reason:null});
        return tx.facility.update({where:{id},data});
      });
    },
  };
}
