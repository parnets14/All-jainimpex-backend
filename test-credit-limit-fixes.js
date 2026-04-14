// Test script to verify credit limit fixes
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './crm_backend/models/SalesOrder.js';
import Dealer from './crm_backend/models/Dealer.js';
import DealerLedger from './crm_backend/models/DealerLedger.js';

dotenv.config();

async function testCreditLimit