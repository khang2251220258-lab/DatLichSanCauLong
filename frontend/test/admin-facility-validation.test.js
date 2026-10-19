import { expect, it } from 'vitest';
import { adminFacilityDetailResponse, adminFacilityListResponse, adminFacilityMutationResponse } from '../src/services/responseValidators';

const now='2026-10-13T03:00:00.000Z';
const core={id:'30',owner_id:'10',name:'Cơ sở Fixture',address:'123 Đường Test',district:'Phường Hải Châu',latitude:null,longitude:null,phone:'0900000000',description:null,opening_time:'06:00',closing_time:'22:00',status:'PENDING',submitted_at:now,reviewed_by:null,reviewed_at:null,rejection_reason:null,suspended_at:null,suspension_reason:null,created_at:now,updated_at:now};
const owner={id:'10',full_name:'Owner Fixture',email:'owner@example.test',phone:null,status:'ACTIVE'};
const list=data=>({data,meta:{server_time:now,page:1,page_size:20,total:data.length}});
const detail=data=>({data,meta:{server_time:now}});

it('accepts exact Admin Facility list/detail DTOs',()=>{expect(adminFacilityListResponse(list([core]))).toBe(true);expect(adminFacilityDetailResponse('30')(detail({...core,owner}))).toBe(true)});
it('rejects malformed list enum, timestamp, primitive and unexpected fields',()=>{expect(adminFacilityListResponse(list([{...core,status:'UNKNOWN'}]))).toBe(false);expect(adminFacilityListResponse(list([{...core,created_at:'today'}]))).toBe(false);expect(adminFacilityListResponse(list([{...core,name:3}]))).toBe(false);expect(adminFacilityListResponse(list([{...core,internal:true}]))).toBe(false)});
it('rejects wrong detail identity and malformed owner',()=>{expect(adminFacilityDetailResponse('31')(detail({...core,owner}))).toBe(false);expect(adminFacilityDetailResponse('30')(detail({...core,owner:{...owner,email:7}}))).toBe(false);expect(adminFacilityDetailResponse('30')(detail({...core,owner:{...owner,secret:'leak'}}))).toBe(false)});
it('enforces state-dependent moderation metadata',()=>{expect(adminFacilityDetailResponse('30')(detail({...core,status:'REJECTED',owner}))).toBe(false);expect(adminFacilityDetailResponse('30')(detail({...core,status:'SUSPENDED',reviewed_by:'1',reviewed_at:now,suspended_at:now,suspension_reason:null,owner}))).toBe(false)});
it('validates mutation target state and exact envelope',()=>{const active={...core,status:'ACTIVE',reviewed_by:'1',reviewed_at:now};expect(adminFacilityMutationResponse('ACTIVE')(detail(active))).toBe(true);expect(adminFacilityMutationResponse('ACTIVE')(detail({...active,status:'PENDING',reviewed_by:null,reviewed_at:null}))).toBe(false);expect(adminFacilityMutationResponse('ACTIVE')({...detail(active),extra:true})).toBe(false)});
