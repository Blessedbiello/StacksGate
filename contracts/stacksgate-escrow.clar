;; StacksGate Escrow Contract
;; Provides escrow functionality for sBTC payments with time-based releases

;; Import sBTC token contract  
(use-trait sip-010-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u401))
(define-constant ERR_INVALID_AMOUNT (err u400))
(define-constant ERR_ESCROW_NOT_FOUND (err u404))
(define-constant ERR_ESCROW_NOT_FUNDED (err u402))
(define-constant ERR_ESCROW_ALREADY_RELEASED (err u409))
(define-constant ERR_RELEASE_TIME_NOT_REACHED (err u403))

;; Define sBTC contract reference
(define-constant SBTC_TOKEN 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token)

;; Data Variables
(define-data-var escrow-nonce uint u0)

;; Data Maps
(define-map escrows
  { escrow-id: (string-ascii 64) }
  {
    sender: principal,
    recipient: principal,
    amount: uint,
    release-height: uint,
    status: (string-ascii 20),
    created-at: uint,
    released-at: (optional uint)
  }
)

;; Public Functions

;; Create and fund escrow
(define-public (create-escrow 
  (escrow-id (string-ascii 64)) 
  (recipient principal) 
  (amount uint) 
  (release-blocks uint)
  (sbtc-contract <sip-010-trait>))
  (let
    (
      (current-block block-height)
      (release-height (+ current-block release-blocks))
    )
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    
    ;; Transfer sBTC to this contract for escrow
    (try! (contract-call? sbtc-contract transfer amount tx-sender (as-contract tx-sender) none))
    
    ;; Create escrow record
    (map-set escrows
      { escrow-id: escrow-id }
      {
        sender: tx-sender,
        recipient: recipient,
        amount: amount,
        release-height: release-height,
        status: "funded",
        created-at: current-block,
        released-at: none
      }
    )
    
    (ok escrow-id)
  )
)

;; Release escrow to recipient (after release time)
(define-public (release-escrow (escrow-id (string-ascii 64)) (sbtc-contract <sip-010-trait>))
  (let
    (
      (escrow-data (unwrap! (map-get? escrows { escrow-id: escrow-id }) ERR_ESCROW_NOT_FOUND))
      (amount (get amount escrow-data))
      (recipient (get recipient escrow-data))
      (release-height (get release-height escrow-data))
      (current-block block-height)
    )
    (asserts! (is-eq (get status escrow-data) "funded") ERR_ESCROW_ALREADY_RELEASED)
    (asserts! (>= current-block release-height) ERR_RELEASE_TIME_NOT_REACHED)
    
    ;; Transfer sBTC from contract to recipient
    (try! (as-contract (contract-call? sbtc-contract transfer amount tx-sender recipient none)))
    
    ;; Update escrow status
    (map-set escrows
      { escrow-id: escrow-id }
      (merge escrow-data {
        status: "released",
        released-at: (some current-block)
      })
    )
    
    (ok true)
  )
)

;; Early release by sender (before release time)
(define-public (early-release (escrow-id (string-ascii 64)) (sbtc-contract <sip-010-trait>))
  (let
    (
      (escrow-data (unwrap! (map-get? escrows { escrow-id: escrow-id }) ERR_ESCROW_NOT_FOUND))
      (sender (get sender escrow-data))
      (amount (get amount escrow-data))
      (recipient (get recipient escrow-data))
      (current-block block-height)
    )
    (asserts! (is-eq tx-sender sender) ERR_UNAUTHORIZED)
    (asserts! (is-eq (get status escrow-data) "funded") ERR_ESCROW_ALREADY_RELEASED)
    
    ;; Transfer sBTC from contract to recipient
    (try! (as-contract (contract-call? sbtc-contract transfer amount tx-sender recipient none)))
    
    ;; Update escrow status
    (map-set escrows
      { escrow-id: escrow-id }
      (merge escrow-data {
        status: "early-released",
        released-at: (some current-block)
      })
    )
    
    (ok true)
  )
)

;; Refund escrow to sender (emergency function)
(define-public (refund-escrow (escrow-id (string-ascii 64)) (sbtc-contract <sip-010-trait>))
  (let
    (
      (escrow-data (unwrap! (map-get? escrows { escrow-id: escrow-id }) ERR_ESCROW_NOT_FOUND))
      (sender (get sender escrow-data))
      (amount (get amount escrow-data))
      (current-block block-height)
    )
    (asserts! (or (is-eq tx-sender sender) (is-eq tx-sender CONTRACT_OWNER)) ERR_UNAUTHORIZED)
    (asserts! (is-eq (get status escrow-data) "funded") ERR_ESCROW_ALREADY_RELEASED)
    
    ;; Transfer sBTC from contract back to sender
    (try! (as-contract (contract-call? sbtc-contract transfer amount tx-sender sender none)))
    
    ;; Update escrow status
    (map-set escrows
      { escrow-id: escrow-id }
      (merge escrow-data {
        status: "refunded",
        released-at: (some current-block)
      })
    )
    
    (ok true)
  )
)

;; Read-only Functions

;; Get escrow details
(define-read-only (get-escrow (escrow-id (string-ascii 64)))
  (map-get? escrows { escrow-id: escrow-id })
)

;; Check if escrow can be released
(define-read-only (can-release (escrow-id (string-ascii 64)))
  (match (map-get? escrows { escrow-id: escrow-id })
    escrow-data 
    (and 
      (is-eq (get status escrow-data) "funded")
      (>= block-height (get release-height escrow-data))
    )
    false
  )
)

;; Get blocks until release
(define-read-only (blocks-until-release (escrow-id (string-ascii 64)))
  (match (map-get? escrows { escrow-id: escrow-id })
    escrow-data
    (let ((release-height (get release-height escrow-data)))
      (if (>= block-height release-height)
        u0
        (- release-height block-height)
      )
    )
    u0
  )
)