;; StacksGate Payment Contract
;; Handles sBTC payments and escrow for the StacksGate platform

;; Import sBTC token contract
(use-trait sip-010-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u401))
(define-constant ERR_INVALID_AMOUNT (err u400))
(define-constant ERR_PAYMENT_NOT_FOUND (err u404))
(define-constant ERR_PAYMENT_ALREADY_COMPLETED (err u409))
(define-constant ERR_INSUFFICIENT_BALANCE (err u402))

;; Define sBTC contract reference
(define-constant SBTC_TOKEN 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token)

;; Data Variables
(define-data-var payment-nonce uint u0)

;; Data Maps
(define-map payments 
  { payment-id: (string-ascii 64) }
  {
    merchant: principal,
    amount: uint,
    recipient: principal,
    status: (string-ascii 20),
    created-at: uint,
    completed-at: (optional uint)
  }
)

(define-map merchant-balances
  { merchant: principal }
  { balance: uint }
)

;; Public Functions

;; Create a new payment intent
(define-public (create-payment (payment-id (string-ascii 64)) (amount uint) (recipient principal))
  (let
    (
      (current-block block-height)
    )
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (map-set payments 
      { payment-id: payment-id }
      {
        merchant: tx-sender,
        amount: amount,
        recipient: recipient,
        status: "pending",
        created-at: current-block,
        completed-at: none
      }
    )
    (ok payment-id)
  )
)

;; Process payment using sBTC
(define-public (process-payment (payment-id (string-ascii 64)) (sbtc-contract <sip-010-trait>))
  (let
    (
      (payment-data (unwrap! (map-get? payments { payment-id: payment-id }) ERR_PAYMENT_NOT_FOUND))
      (amount (get amount payment-data))
      (recipient (get recipient payment-data))
      (current-block block-height)
    )
    (asserts! (is-eq (get status payment-data) "pending") ERR_PAYMENT_ALREADY_COMPLETED)
    
    ;; Transfer sBTC from sender to recipient
    (try! (contract-call? sbtc-contract transfer amount tx-sender recipient none))
    
    ;; Update payment status
    (map-set payments
      { payment-id: payment-id }
      (merge payment-data {
        status: "completed",
        completed-at: (some current-block)
      })
    )
    
    ;; Update merchant balance
    (let
      (
        (current-balance (default-to u0 (get balance (map-get? merchant-balances { merchant: (get merchant payment-data) }))))
      )
      (map-set merchant-balances
        { merchant: (get merchant payment-data) }
        { balance: (+ current-balance amount) }
      )
    )
    
    (ok true)
  )
)

;; Refund a payment (only by merchant or contract owner)
(define-public (refund-payment (payment-id (string-ascii 64)) (sbtc-contract <sip-010-trait>))
  (let
    (
      (payment-data (unwrap! (map-get? payments { payment-id: payment-id }) ERR_PAYMENT_NOT_FOUND))
      (amount (get amount payment-data))
      (merchant (get merchant payment-data))
      (current-block block-height)
    )
    (asserts! (or (is-eq tx-sender merchant) (is-eq tx-sender CONTRACT_OWNER)) ERR_UNAUTHORIZED)
    (asserts! (is-eq (get status payment-data) "pending") ERR_PAYMENT_ALREADY_COMPLETED)
    
    ;; Update payment status to refunded
    (map-set payments
      { payment-id: payment-id }
      (merge payment-data {
        status: "refunded",
        completed-at: (some current-block)
      })
    )
    
    (ok true)
  )
)

;; Read-only Functions

;; Get payment details
(define-read-only (get-payment (payment-id (string-ascii 64)))
  (map-get? payments { payment-id: payment-id })
)

;; Get merchant balance
(define-read-only (get-merchant-balance (merchant principal))
  (default-to u0 (get balance (map-get? merchant-balances { merchant: merchant })))
)

;; Get contract stats
(define-read-only (get-stats)
  {
    total-payments: (var-get payment-nonce),
    contract-owner: CONTRACT_OWNER
  }
)

;; Verify sBTC balance for payment
(define-read-only (can-afford-payment (sender principal) (amount uint))
  (>= (unwrap-panic (contract-call? SBTC_TOKEN get-balance sender)) amount)
)