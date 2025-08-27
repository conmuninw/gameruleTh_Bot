const states = new Map();

class StateService {
  setState(userId, state, data = {}, ttl = 3600000) { // TTL 1 ชั่วโมง
    states.set(userId, {
      state,
      data,
      expires: Date.now() + ttl
    });
  }

  getState(userId) {
    const stateData = states.get(userId);
    if (!stateData) return null;
    
    // ตรวจสอบว่า state หมดอายุหรือไม่
    if (Date.now() > stateData.expires) {
      states.delete(userId);
      return null;
    }
    
    return stateData;
  }

  clearState(userId) {
    states.delete(userId);
  }

  // ลบ state ที่หมดอายุแล้ว
  cleanupExpiredStates() {
    const now = Date.now();
    for (const [userId, stateData] of states.entries()) {
      if (now > stateData.expires) {
        states.delete(userId);
      }
    }
  }
}

// ทำความ cleanup ทุก 10 นาที
setInterval(() => {
  new StateService().cleanupExpiredStates();
}, 600000);

module.exports = new StateService();