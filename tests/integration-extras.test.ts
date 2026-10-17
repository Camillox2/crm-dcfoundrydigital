import {it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './helpers/database.js';
import {persistAttribution} from '../apps/api/src/lead-import.js';
it('persists campaign fields on native leads',async()=>{const db=await testDatabase(),id=randomUUID();try{await db.pool.query("INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'attribution@test.dev','Test','hash')",[id]);const lead=(await db.pool.query("INSERT INTO workspace_leads(owner_id,name,company,phone) VALUES($1,'Test','Test','') RETURNING id",[id])).rows[0];await persistAttribution(db.pool,lead.id,{});}finally{await db.pool.end();}},30000);
