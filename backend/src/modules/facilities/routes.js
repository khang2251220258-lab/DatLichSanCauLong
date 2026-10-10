import { Router } from 'express';
import { AuthError } from '../auth/errors.js';
import { authenticate, requireOrigin, requireCsrf } from '../auth/middleware.js';
import { bodyInput, emptyBody, requestId, reasonInput, listQuery } from './validation.js';

export function facilityRoutes(service,auth,config,admin=false) {
  const router = Router();
  const send = (res,status,data,meta={}) => res.status(status).json({data,meta:{server_time:new Date().toISOString(),...meta}});
  router.use(authenticate(auth),(req,res,next)=>{
    res.set('Cache-Control','no-store');
    if (!req.auth.user.capabilities.includes(admin ? 'ADMIN' : 'OWNER')) throw new AuthError(403,'FORBIDDEN','Bạn không có quyền thực hiện thao tác này.');
    next();
  });
  router.get('/',async(req,res)=>{
    const query=listQuery(req.query,admin), result=await service.list(req.auth,query,admin);
    send(res,200,result.items,{page:query.page,page_size:query.page_size,total:result.total});
  });
  router.get('/:id',async(req,res)=>send(res,200,await service.detail(req.auth,requestId(req.params.id),admin)));
  const write=[requireOrigin(config.frontendUrl),requireCsrf];
  if (!admin) {
    router.post('/',...write,async(req,res)=>send(res,201,await service.create(req.auth,bodyInput(req.body))));
    router.patch('/:id',...write,async(req,res)=>send(res,200,await service.patch(req.auth,requestId(req.params.id),bodyInput(req.body,true))));
  }
  for (const action of admin ? ['approve','reject','suspend','activate'] : ['submit']) {
    router.post(`/:id/${action}`,...write,async(req,res)=>{
      const reason = ['reject','suspend'].includes(action) ? reasonInput(req.body) : (emptyBody(req.body),undefined);
      send(res,200,await service.transition(req.auth,requestId(req.params.id),action,reason));
    });
  }
  return router;
}
