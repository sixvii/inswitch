package com.interswitch.backend.service;

import com.interswitch.backend.model.PayoutRequest;
import com.interswitch.backend.repository.PayoutRequestRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class PayoutService {

    private final PayoutRequestRepository repository;

    public PayoutService(PayoutRequestRepository repository) {
        this.repository = repository;
    }

    public PayoutRequest create(PayoutRequest payload) {
        Optional<PayoutRequest> existing = repository.findByIdempotencyKey(payload.getIdempotencyKey());
        if (existing.isPresent()) {
            return existing.get();
        }

        Instant now = Instant.now();
        payload.setCreatedAt(now);
        payload.setUpdatedAt(now);
        payload.setStatus(payload.getStatus() == null || payload.getStatus().isBlank() ? "PENDING" : payload.getStatus());
        payload.setProviderReference(payload.getProviderReference() == null || payload.getProviderReference().isBlank()
                ? "JAVA-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase()
                : payload.getProviderReference());

        return repository.save(payload);
    }

    public List<PayoutRequest> list() {
        return repository.findAll();
    }
}
