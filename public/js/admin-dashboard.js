class AdminDashboard {
    constructor() {
        this.currentPage = 1;
        this.totalPages = 1;
        this.currentTab = 'dashboard';
        this.initializeEventListeners();
        this.loadDashboardData();
    }

    initializeEventListeners() {
        // Tab navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = item.getAttribute('data-tab');
                this.switchTab(tab);
            });
        });

        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadTransactions();
            }
        });

        document.getElementById('nextPage').addEventListener('click', () => {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
                this.loadTransactions();
            }
        });

        // Filters
        document.getElementById('statusFilter').addEventListener('change', () => {
            this.currentPage = 1;
            this.loadTransactions();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', this.logout.bind(this));

        // Modal close
        document.querySelectorAll('.close').forEach(close => {
            close.addEventListener('click', () => {
                document.querySelectorAll('.modal').forEach(modal => {
                    modal.style.display = 'none';
                });
            });
        });
    }

    async switchTab(tab) {
        // Update active tab
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tab}-tab`).classList.add('active');

        // Update page title
        document.getElementById('pageTitle').textContent = 
            document.querySelector(`[data-tab="${tab}"]`).textContent.trim();

        // Load tab-specific data
        switch(tab) {
            case 'dashboard':
                this.loadDashboardData();
                break;
            case 'transactions':
                this.loadTransactions();
                break;
            case 'payments':
                this.loadPaymentVerifications();
                break;
            case 'seller-payments':
                this.loadSellerPayments();
                break;
            case 'users':
                this.loadUsers();
                break;
        }
    }

    async loadDashboardData() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/admin/dashboard');
            const data = await response.json();

            // Update stats
            document.getElementById('totalIncome').textContent = 
                `${data.totalIncome.toLocaleString()} บาท`;
            document.getElementById('totalTransactions').textContent = 
                data.totalTransactions.toLocaleString();
            document.getElementById('pendingTransactions').textContent = 
                data.pendingTransactions.toLocaleString();
            document.getElementById('totalUsers').textContent = 
                data.totalUsers.toLocaleString();

            // Update notification count
            document.getElementById('notificationCount').textContent = 
                data.pendingVerifications;

            // Load charts
            this.loadCharts(data.charts);
            this.loadActivities(data.recentActivities);

        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    async loadTransactions() {
        try {
            const statusFilter = document.getElementById('statusFilter').value;
            const dateFilter = document.getElementById('dateFilter').value;

            const response = await fetch(
                `/api/admin/transactions?page=${this.currentPage}&status=${statusFilter}&date=${dateFilter}`
            );
            const data = await response.json();

            this.totalPages = data.totalPages;
            this.renderTransactions(data.transactions);
            this.updatePagination();

        } catch (error) {
            console.error('Error loading transactions:', error);
        }
    }

    renderTransactions(transactions) {
        const tbody = document.getElementById('transactionsBody');
        tbody.innerHTML = '';

        if (transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8">ไม่พบข้อมูล</td></tr>';
            return;
        }

        transactions.forEach(transaction => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${transaction.transactionId}</td>
                <td>${transaction.sellerId}</td>
                <td>${transaction.buyerId || '-'}</td>
                <td>${transaction.gameDetails.game}</td>
                <td>${transaction.gameDetails.price.toLocaleString()} บาท</td>
                <td><span class="status-badge status-${transaction.status}">${this.getStatusText(transaction.status)}</span></td>
                <td>${new Date(transaction.createdAt).toLocaleDateString('th-TH')}</td>
                <td>
                    <button class="btn btn-primary" onclick="admin.viewTransaction('${transaction.transactionId}')">
                        <i class="fas fa-eye"></i> ดูรายละเอียด
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    getStatusText(status) {
        const statusMap = {
            'waiting_buyer': 'รอผู้ซื้อ',
            'waiting_payment': 'รอชำระเงิน',
            'payment_verification': 'รอตรวจสอบ',
            'paid': 'ชำระเงินแล้ว',
            'delivering': 'กำลังส่ง',
            'completed': 'เสร็จสิ้น',
            'cancelled': 'ยกเลิก'
        };
        return statusMap[status] || status;
    }

    updatePagination() {
        document.getElementById('pageInfo').textContent = `หน้า ${this.currentPage} จาก ${this.totalPages}`;
        document.getElementById('prevPage').disabled = this.currentPage === 1;
        document.getElementById('nextPage').disabled = this.currentPage === this.totalPages;
    }

    async viewTransaction(transactionId) {
        try {
            const response = await fetch(`http://127.0.0.1:5000/api/admin/transactions/${transactionId}`);
            const transaction = await response.json();

            const modal = document.getElementById('transactionModal');
            const details = document.getElementById('transactionDetails');
            
            details.innerHTML = `
                <div class="transaction-detail">
                    <p><strong>Transaction ID:</strong> ${transaction.transactionId}</p>
                    <p><strong>ผู้ขาย:</strong> ${transaction.sellerId}</p>
                    <p><strong>ผู้ซื้อ:</strong> ${transaction.buyerId || '-'}</p>
                    <p><strong>เกม:</strong> ${transaction.gameDetails.game}</p>
                    <p><strong>ระดับ:</strong> ${transaction.gameDetails.level}</p>
                    <p><strong>ราคา:</strong> ${transaction.gameDetails.price.toLocaleString()} บาท</p>
                    <p><strong>สถานะ:</strong> <span class="status-badge status-${transaction.status}">${this.getStatusText(transaction.status)}</span></p>
                    <p><strong>วันที่สร้าง:</strong> ${new Date(transaction.createdAt).toLocaleString('th-TH')}</p>
                    ${transaction.paidAt ? `<p><strong>วันที่ชำระเงิน:</strong> ${new Date(transaction.paidAt).toLocaleString('th-TH')}</p>` : ''}
                </div>
            `;

            modal.style.display = 'block';

        } catch (error) {
            console.error('Error viewing transaction:', error);
        }
    }

    async loadPaymentVerifications() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/admin/payments/verification');
            const payments = await response.json();

            const container = document.getElementById('paymentVerificationList');
            container.innerHTML = '';

            if (payments.length === 0) {
                container.innerHTML = '<div class="verification-item">ไม่มีรายการที่ต้องตรวจสอบ</div>';
                return;
            }

            payments.forEach(payment => {
                const item = document.createElement('div');
                item.className = 'verification-item';
                item.innerHTML = `
                    <div class="verification-header">
                        <h4>Transaction: ${payment.transactionId}</h4>
                        <span class="amount">${payment.amount.toLocaleString()} บาท</span>
                    </div>
                    <div class="verification-body">
                        <p><strong>ผู้ซื้อ:</strong> ${payment.buyerId}</p>
                        <p><strong>วันที่ชำระ:</strong> ${new Date(payment.createdAt).toLocaleString('th-TH')}</p>
                        ${payment.paymentProof ? `
                            <div class="proof-image">
                                <img src="${payment.paymentProof}" alt="หลักฐานการโอน" onclick="admin.viewPaymentProof('${payment.transactionId}')">
                            </div>
                        ` : ''}
                    </div>
                    <div class="verification-actions">
                        <button class="btn btn-success" onclick="admin.confirmPayment('${payment.transactionId}')">
                            <i class="fas fa-check"></i> ยืนยัน
                        </button>
                        <button class="btn btn-danger" onclick="admin.rejectPayment('${payment.transactionId}')">
                            <i class="fas fa-times"></i> ปฏิเสธ
                        </button>
                    </div>
                `;
                container.appendChild(item);
            });

        } catch (error) {
            console.error('Error loading payment verifications:', error);
        }
    }

    async loadSellerPayments() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/admin/seller-payments');
            const payments = await response.json();

            const container = document.getElementById('sellerPaymentsList');
            container.innerHTML = '';

            if (payments.length === 0) {
                container.innerHTML = '<div class="payment-item">ไม่มีรายการที่ต้องจ่ายเงิน</div>';
                return;
            }

            payments.forEach(payment => {
                const item = document.createElement('div');
                item.className = 'payment-item';
                item.innerHTML = `
                    <div class="payment-header">
                        <h4>Transaction: ${payment.transactionId}</h4>
                        <span class="amount">${payment.amount.toLocaleString()} บาท</span>
                    </div>
                    <div class="payment-body">
                        <p><strong>ผู้ขาย:</strong> ${payment.sellerId}</p>
                        <p><strong>บัญชี:</strong> ${payment.bankName} - ${payment.accountNumber}</p>
                        <p><strong>ชื่อบัญชี:</strong> ${payment.accountName}</p>
                        <div class="qr-code">
                            <img src="https://promptpay.io/${payment.promptPayNumber}/${payment.amount}.png" 
                                 alt="QR Code จ่ายเงิน" width="200">
                        </div>
                    </div>
                    <div class="payment-actions">
                        <button class="btn btn-success" onclick="admin.confirmSellerPayment('${payment.transactionId}')">
                            <i class="fas fa-check"></i> ยืนยันการจ่ายเงิน
                        </button>
                    </div>
                `;
                container.appendChild(item);
            });

        } catch (error) {
            console.error('Error loading seller payments:', error);
        }
    }

    async confirmPayment(transactionId) {
        try {
            const response = await fetch(`http://127.0.0.1:5000/api/admin/payments/${transactionId}/confirm`, {
                method: 'POST'
            });

            if (response.ok) {
                alert('ยืนยันการชำระเงินเรียบร้อย');
                this.loadPaymentVerifications();
                this.loadDashboardData();
            }
        } catch (error) {
            console.error('Error confirming payment:', error);
        }
    }

    async confirmSellerPayment(transactionId) {
        try {
            const response = await fetch(`http://127.0.0.1:5000/api/admin/seller-payments/${transactionId}/confirm`, {
                method: 'POST'
            });

            if (response.ok) {
                alert('ยืนยันการจ่ายเงินให้ผู้ขายเรียบร้อย');
                this.loadSellerPayments();
                this.loadDashboardData();
            }
        } catch (error) {
            console.error('Error confirming seller payment:', error);
        }
    }

    logout() {
        if (confirm('ต้องการออกจากระบบใช่หรือไม่?')) {
            fetch('http://127.0.0.1:5000/api/admin/logout', { method: 'POST' })
                .then(() => {
                    window.location.href = 'http://127.0.0.1:5000/admin/login';
                })
                .catch(error => {
                    console.error('Logout error:', error);
                });
        }
    }

    loadCharts(chartData) {
        // Daily transactions chart
        const dailyCtx = document.getElementById('dailyTransactionsChart').getContext('2d');
        new Chart(dailyCtx, {
            type: 'line',
            data: {
                labels: chartData.dailyLabels,
                datasets: [{
                    label: 'ธุรกรรมรายวัน',
                    data: chartData.dailyData,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    fill: true
                }]
            }
        });

        // Status pie chart
        const statusCtx = document.getElementById('statusPieChart').getContext('2d');
        new Chart(statusCtx, {
            type: 'pie',
            data: {
                labels: chartData.statusLabels,
                datasets: [{
                    data: chartData.statusData,
                    backgroundColor: [
                        '#3498db', '#f39c12', '#27ae60', 
                        '#9b59b6', '#e74c3c', '#95a5a6'
                    ]
                }]
            }
        });
    }

    loadActivities(activities) {
        const container = document.getElementById('activitiesList');
        container.innerHTML = '';

        activities.forEach(activity => {
            const item = document.createElement('div');
            item.className = 'activity-item';
            item.innerHTML = `
                <i class="fas fa-${activity.icon}"></i>
                <div>
                    <p>${activity.message}</p>
                    <small>${new Date(activity.timestamp).toLocaleString('th-TH')}</small>
                </div>
            `;
            container.appendChild(item);
        });
    }

    // Add these methods to the AdminDashboard class

async rejectPayment(transactionId) {
    try {
        const response = await fetch(`http://127.0.0.1:5000/api/admin/payments/${transactionId}/reject`, {
            method: 'POST'
        });

        if (response.ok) {
            alert('ปฏิเสธการชำระเงินเรียบร้อย');
            this.loadPaymentVerifications();
            this.loadDashboardData();
        }
    } catch (error) {
        console.error('Error rejecting payment:', error);
    }
}

async viewPaymentProof(transactionId) {
    try {
        const response = await fetch(`http://127.0.0.1:5000/api/admin/payments/${transactionId}/proof`);
        const payment = await response.json();

        const modal = document.getElementById('paymentModal');
        const details = document.getElementById('paymentDetails');
        
        details.innerHTML = `
            <div class="payment-detail">
                <p><strong>Transaction ID:</strong> ${payment.transactionId}</p>
                <p><strong>ผู้ซื้อ:</strong> ${payment.buyerId}</p>
                <p><strong>จำนวนเงิน:</strong> ${payment.amount.toLocaleString()} บาท</p>
                <p><strong>วันที่ชำระ:</strong> ${new Date(payment.createdAt).toLocaleString('th-TH')}</p>
                ${payment.paymentProof ? `
                    <div class="proof-image">
                        <img src="${payment.paymentProof}" alt="หลักฐานการโอน" style="max-width: 100%;">
                    </div>
                ` : ''}
            </div>
        `;

        modal.style.display = 'block';
        this.currentTransactionId = transactionId;

    } catch (error) {
        console.error('Error viewing payment proof:', error);
    }
}

async loadUsers() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/admin/users');
        const users = await response.json();

        const tbody = document.getElementById('usersBody');
        tbody.innerHTML = '';

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">ไม่พบข้อมูลผู้ใช้งาน</td></tr>';
            return;
        }

        users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.userId}</td>
                <td>${user.type === 'seller' ? 'ผู้ขาย' : 'ผู้ซื้อ'}</td>
                <td>${user.transactionCount}</td>
                <td>${user.totalAmount ? user.totalAmount.toLocaleString() : 0} บาท</td>
                <td>${new Date(user.createdAt).toLocaleDateString('th-TH')}</td>
                <td><span class="status-badge ${user.status === 'active' ? 'status-completed' : 'status-cancelled'}">${user.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></td>
            `;
            tbody.appendChild(row);
        });

    } catch (error) {
        console.error('Error loading users:', error);
    }
}
}

// Initialize admin dashboard
const admin = new AdminDashboard();

// Global functions for HTML onclick
function confirmPayment() {
    admin.confirmPayment();
}

function rejectPayment() {
    admin.rejectPayment();
}

// class AdminDashboard {
//     constructor() {
//         this.currentPage = 1;
//         this.totalPages = 1;
//         this.currentTab = 'dashboard';
//         this.initializeEventListeners();
//         this.loadDashboardData();
//     }

//     initializeEventListeners() {
//         document.querySelectorAll('.nav-item').forEach(item => {
//             item.addEventListener('click', (e) => {
//                 e.preventDefault();
//                 const tab = item.getAttribute('data-tab');
//                 this.switchTab(tab);
//             });
//         });

//         document.getElementById('prevPage').addEventListener('click', () => {
//             if (this.currentPage > 1) {
//                 this.currentPage--;
//                 this.loadTransactions();
//             }
//         });

//         document.getElementById('nextPage').addEventListener('click', () => {
//             if (this.currentPage < this.totalPages) {
//                 this.currentPage++;
//                 this.loadTransactions();
//             }
//         });

//         document.getElementById('statusFilter').addEventListener('change', () => {
//             this.currentPage = 1;
//             this.loadTransactions();
//         });

//         document.getElementById('logoutBtn').addEventListener('click', this.logout.bind(this));

//         document.querySelectorAll('.close').forEach(close => {
//             close.addEventListener('click', () => {
//                 document.querySelectorAll('.modal').forEach(modal => {
//                     modal.style.display = 'none';
//                 });
//             });
//         });
//     }

//     async switchTab(tab) {
//         document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
//         document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

//         document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
//         document.getElementById(`${tab}-tab`).classList.add('active');

//         document.getElementById('pageTitle').textContent = document.querySelector(`[data-tab="${tab}"]`).textContent.trim();

//         switch(tab) {
//             case 'dashboard': this.loadDashboardData(); break;
//             case 'transactions': this.loadTransactions(); break;
//             case 'payments': this.loadPaymentVerifications(); break;
//             case 'seller-payments': this.loadSellerPayments(); break;
//             case 'users': this.loadUsers(); break;
//         }
//     }

//     async loadDashboardData() {
//         try {
//             const response = await fetch('http://127.0.0.1:5000/api/admin/dashboard');
//             const data = await response.json();

//             document.getElementById('totalIncome').textContent = `${data.totalIncome.toLocaleString()} บาท`;
//             document.getElementById('totalTransactions').textContent = data.totalTransactions.toLocaleString();
//             document.getElementById('pendingTransactions').textContent = data.pendingTransactions.toLocaleString();
//             document.getElementById('totalUsers').textContent = data.totalUsers.toLocaleString();
//             document.getElementById('notificationCount').textContent = data.pendingVerifications;

//             this.loadCharts(data.charts);
//             this.loadActivities(data.recentActivities);

//         } catch (error) {
//             console.error('Error loading dashboard data:', error);
//         }
//     }

//     async loadTransactions() {
//         try {
//             const statusFilter = document.getElementById('statusFilter').value;
//             const dateFilter = document.getElementById('dateFilter').value;

//             const response = await fetch(
//                 `/api/admin/transactions?page=${this.currentPage}&status=${statusFilter}&date=${dateFilter}`
//             );
//             const data = await response.json();

//             this.totalPages = data.totalPages;
//             this.renderTransactions(data.transactions);
//             this.updatePagination();

//         } catch (error) {
//             console.error('Error loading transactions:', error);
//         }
//     }

//     renderTransactions(transactions) {
//         const tbody = document.getElementById('transactionsBody');
//         tbody.innerHTML = '';

//         if (transactions.length === 0) {
//             tbody.innerHTML = '<tr><td colspan="8">ไม่พบข้อมูล</td></tr>';
//             return;
//         }

//         transactions.forEach(transaction => {
//             const row = document.createElement('tr');
//             row.innerHTML = `
//                 <td>${transaction.transactionId}</td>
//                 <td>${transaction.sellerId}</td>
//                 <td>${transaction.buyerId || '-'}</td>
//                 <td>${transaction.gameDetails.game}</td>
//                 <td>${transaction.gameDetails.price.toLocaleString()} บาท</td>
//                 <td><span class="status-badge status-${transaction.status}">${this.getStatusText(transaction.status)}</span></td>
//                 <td>${new Date(transaction.createdAt).toLocaleDateString('th-TH')}</td>
//                 <td>
//                     <button class="btn btn-primary" onclick="admin.viewTransaction('${transaction.transactionId}')">
//                         <i class="fas fa-eye"></i> ดูรายละเอียด
//                     </button>
//                 </td>
//             `;
//             tbody.appendChild(row);
//         });
//     }

//     getStatusText(status) {
//         const statusMap = {
//             'waiting_buyer': 'รอผู้ซื้อ',
//             'waiting_payment': 'รอชำระเงิน',
//             'payment_verification': 'รอตรวจสอบ',
//             'paid': 'ชำระเงินแล้ว',
//             'delivering': 'กำลังส่ง',
//             'awaiting_seller_payment': 'รอโอนให้ผู้ขาย',
//             'completed': 'เสร็จสิ้น',
//             'cancelled': 'ยกเลิก'
//         };
//         return statusMap[status] || status;
//     }

//     updatePagination() {
//         document.getElementById('pageInfo').textContent = `หน้า ${this.currentPage} จาก ${this.totalPages}`;
//         document.getElementById('prevPage').disabled = this.currentPage === 1;
//         document.getElementById('nextPage').disabled = this.currentPage === this.totalPages;
//     }

//     async viewTransaction(transactionId) {
//         try {
//             const response = await fetch(`http://127.0.0.1:5000/api/admin/transactions/${transactionId}`);
//             const transaction = await response.json();

//             const modal = document.getElementById('transactionModal');
//             const details = document.getElementById('transactionDetails');
            
//             details.innerHTML = `
//                 <div class="transaction-detail">
//                     <p><strong>Transaction ID:</strong> ${transaction.transactionId}</p>
//                     <p><strong>ผู้ขาย:</strong> ${transaction.sellerId}</p>
//                     <p><strong>ผู้ซื้อ:</strong> ${transaction.buyerId || '-'}</p>
//                     <p><strong>เกม:</strong> ${transaction.gameDetails.game}</p>
//                     <p><strong>ระดับ:</strong> ${transaction.gameDetails.level}</p>
//                     <p><strong>ราคา:</strong> ${transaction.gameDetails.price.toLocaleString()} บาท</p>
//                     <p><strong>สถานะ:</strong> <span class="status-badge status-${transaction.status}">${this.getStatusText(transaction.status)}</span></p>
//                     <p><strong>วันที่สร้าง:</strong> ${new Date(transaction.createdAt).toLocaleString('th-TH')}</p>
//                     ${transaction.paidAt ? `<p><strong>วันที่ชำระเงิน:</strong> ${new Date(transaction.paidAt).toLocaleString('th-TH')}</p>` : ''}
//                 </div>
//             `;
//             modal.style.display = 'block';

//         } catch (error) {
//             console.error('Error viewing transaction:', error);
//         }
//     }

//     async loadPaymentVerifications() {
//         try {
//             const response = await fetch('http://127.0.0.1:5000/api/admin/payments/verification');
//             const payments = await response.json();

//             const container = document.getElementById('paymentVerificationList');
//             container.innerHTML = '';

//             if (payments.length === 0) {
//                 container.innerHTML = '<div class="verification-item">ไม่มีรายการที่ต้องตรวจสอบ</div>';
//                 return;
//             }

//             payments.forEach(payment => {
//                 const item = document.createElement('div');
//                 item.className = 'verification-item';
//                 item.innerHTML = `
//                     <div class="verification-header">
//                         <h4>Transaction: ${payment.transactionId}</h4>
//                         <span class="amount">${payment.paymentAmount.toLocaleString()} บาท</span>
//                     </div>
//                     <div class="verification-body">
//                         <p><strong>ผู้ซื้อ:</strong> ${payment.buyerId}</p>
//                         <p><strong>วันที่ชำระ:</strong> ${new Date(payment.createdAt).toLocaleString('th-TH')}</p>
//                         ${payment.paymentProof?.imageUrl ? `
//                             <div class="proof-image">
//                                 <img src="${payment.paymentProof.imageUrl}" alt="หลักฐานการโอน" onclick="admin.viewPaymentProof('${payment.transactionId}')">
//                             </div>
//                         ` : ''}
//                     </div>
//                     <div class="verification-actions">
//                         <button class="btn btn-success" onclick="admin.confirmPayment('${payment.transactionId}')">
//                             <i class="fas fa-check"></i> ยืนยัน
//                         </button>
//                         <button class="btn btn-danger" onclick="admin.rejectPayment('${payment.transactionId}')">
//                             <i class="fas fa-times"></i> ปฏิเสธ
//                         </button>
//                     </div>
//                 `;
//                 container.appendChild(item);
//             });

//         } catch (error) {
//             console.error('Error loading payment verifications:', error);
//         }
//     }

//     async loadSellerPayments() {
//         try {
//             const response = await fetch('http://127.0.0.1:5000/api/admin/seller-payments');
//             const payments = await response.json();

//             const container = document.getElementById('sellerPaymentsList');
//             container.innerHTML = '';

//             if (payments.length === 0) {
//                 container.innerHTML = '<div class="payment-item">ไม่มีรายการที่ต้องจ่ายเงิน</div>';
//                 return;
//             }

//             payments.forEach(payment => {
//                 const item = document.createElement('div');
//                 item.className = 'payment-item';
//                 item.innerHTML = `
//                     <div class="payment-header">
//                         <h4>Transaction: ${payment.transactionId}</h4>
//                         <span class="amount">${payment.paymentAmount.toLocaleString()} บาท</span>
//                     </div>
//                     <div class="payment-body">
//                         <p><strong>ผู้ขาย:</strong> ${payment.sellerId}</p>
//                         <p><strong>บัญชี:</strong> ${payment.sellerBankInfo?.bankName || '-'} - ${payment.sellerBankInfo?.accountNumber || '-'}</p>
//                         <p><strong>ชื่อบัญชี:</strong> ${payment.sellerBankInfo?.accountName || '-'}</p>
//                         <p><strong>PromptPay:</strong> ${payment.sellerBankInfo?.promptPayNumber || '-'}</p>
//                         <div class="qr-code">
//                             <img src="https://promptpay.io/${payment.sellerBankInfo?.promptPayNumber}/${payment.paymentAmount}.png" 
//                                  alt="QR Code จ่ายเงิน" width="200">
//                         </div>
//                     </div>
//                     <div class="payment-actions">
//                         <button class="btn btn-success" onclick="admin.confirmSellerPayment('${payment.transactionId}')">
//                             <i class="fas fa-check"></i> ยืนยันการจ่ายเงิน
//                         </button>
//                     </div>
//                 `;
//                 container.appendChild(item);
//             });

//         } catch (error) {
//             console.error('Error loading seller payments:', error);
//         }
//     }

//     async confirmPayment(transactionId) {
//         try {
//             const response = await fetch(`http://127.0.0.1:5000/api/admin/payments/${transactionId}/confirm`, { method: 'POST' });
//             if (response.ok) {
//                 alert('ยืนยันการชำระเงินเรียบร้อย');
//                 this.loadPaymentVerifications();
//                 this.loadDashboardData();
//             }
//         } catch (error) {
//             console.error('Error confirming payment:', error);
//         }
//     }

//     async rejectPayment(transactionId) {
//         try {
//             const response = await fetch(`http://127.0.0.1:5000/api/admin/payments/${transactionId}/reject`, { method: 'POST' });
//             if (response.ok) {
//                 alert('ปฏิเสธการชำระเงินเรียบร้อย');
//                 this.loadPaymentVerifications();
//                 this.loadDashboardData();
//             }
//         } catch (error) {
//             console.error('Error rejecting payment:', error);
//         }
//     }

//     async confirmSellerPayment(transactionId) {
//         try {
//             const response = await fetch(`http://127.0.0.1:5000/api/admin/seller-payments/${transactionId}/confirm`, { method: 'POST' });
//             if (response.ok) {
//                 alert('ยืนยันการจ่ายเงินให้ผู้ขายเรียบร้อย');
//                 this.loadSellerPayments();
//                 this.loadDashboardData();
//             }
//         } catch (error) {
//             console.error('Error confirming seller payment:', error);
//         }
//     }

//     async viewPaymentProof(transactionId) {
//         try {
//             const response = await fetch(`http://127.0.0.1:5000/api/admin/payments/${transactionId}/proof`);
//             const payment = await response.json();

//             const modal = document.getElementById('paymentModal');
//             const details = document.getElementById('paymentDetails');
            
//             details.innerHTML = `
//                 <div class="payment-detail">
//                     <p><strong>Transaction ID:</strong> ${payment.transactionId}</p>
//                     <p><strong>ผู้ซื้อ:</strong> ${payment.buyerId}</p>
//                     <p><strong>จำนวนเงิน:</strong> ${payment.paymentAmount.toLocaleString()} บาท</p>
//                     <p><strong>วันที่ชำระ:</strong> ${new Date(payment.createdAt).toLocaleString('th-TH')}</p>
//                     ${payment.paymentProof?.imageUrl ? `
//                         <div class="proof-image">
//                             <img src="${payment.paymentProof.imageUrl}" alt="หลักฐานการโอน" style="max-width: 100%;">
//                         </div>
//                     ` : ''}
//                 </div>
//             `;
//             modal.style.display = 'block';
//             this.currentTransactionId = transactionId;

//         } catch (error) {
//             console.error('Error viewing payment proof:', error);
//         }
//     }

//     async loadUsers() {
//         try {
//             const response = await fetch('http://127.0.0.1:5000/api/admin/users');
//             const users = await response.json();

//             const tbody = document.getElementById('usersBody');
//             tbody.innerHTML = '';

//             if (users.length === 0) {
//                 tbody.innerHTML = '<tr><td colspan="6">ไม่พบข้อมูลผู้ใช้งาน</td></tr>';
//                 return;
//             }

//             users.forEach(user => {
//                 const row = document.createElement('tr');
//                 row.innerHTML = `
//                     <td>${user.userId}</td>
//                     <td>${user.type === 'seller' ? 'ผู้ขาย' : 'ผู้ซื้อ'}</td>
//                     <td>${user.transactionCount}</td>
//                     <td>${user.totalAmount ? user.totalAmount.toLocaleString() : 0} บาท</td>
//                     <td>${new Date(user.createdAt).toLocaleDateString('th-TH')}</td>
//                     <td><span class="status-badge ${user.status === 'active' ? 'status-completed' : 'status-cancelled'}">${user.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></td>
//                 `;
//                 tbody.appendChild(row);
//             });

//         } catch (error) {
//             console.error('Error loading users:', error);
//         }
//     }

//     logout() {
//         if (confirm('ต้องการออกจากระบบใช่หรือไม่?')) {
//             fetch('http://127.0.0.1:5000/api/admin/logout', { method: 'POST' })
//                 .then(() => window.location.href = 'http://127.0.0.1:5000/admin/login')
//                 .catch(error => console.error('Logout error:', error));
//         }
//     }

//     loadCharts(chartData) {
//         const dailyCtx = document.getElementById('dailyTransactionsChart').getContext('2d');
//         new Chart(dailyCtx, {
//             type: 'line',
//             data: {
//                 labels: chartData.dailyLabels,
//                 datasets: [{
//                     label: 'ธุรกรรมรายวัน',
//                     data: chartData.dailyData,
//                     borderColor: '#3498db',
//                     backgroundColor: 'rgba(52, 152, 219, 0.1)',
//                     fill: true
//                 }]
//             }
//         });

//         const statusCtx = document.getElementById('statusPieChart').getContext('2d');
//         new Chart(statusCtx, {
//             type: 'pie',
//             data: {
//                 labels: chartData.statusLabels,
//                 datasets: [{
//                     data: chartData.statusData,
//                     backgroundColor: ['#3498db', '#f39c12', '#27ae60', '#9b59b6', '#e74c3c', '#95a5a6']
//                 }]
//             }
//         });
//     }

//     loadActivities(activities) {
//         const container = document.getElementById('activitiesList');
//         container.innerHTML = '';

//         activities.forEach(activity => {
//             const item = document.createElement('div');
//             item.className = 'activity-item';
//             item.innerHTML = `
//                 <i class="fas fa-${activity.icon}"></i>
//                 <div>
//                     <p>${activity.message}</p>
//                     <small>${new Date(activity.timestamp).toLocaleString('th-TH')}</small>
//                 </div>
//             `;
//             container.appendChild(item);
//         });
//     }
// }

// const admin = new AdminDashboard();
