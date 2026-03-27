package com.interswitch.backend.repository;

import com.interswitch.backend.model.PayoutRequest;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface PayoutRequestRepository extends MongoRepository<PayoutRequest, String> {
    Optional<PayoutRequest> findByIdempotencyKey(String idempotencyKey);
}
